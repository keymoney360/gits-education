import express from "express";
import mongoose from "mongoose";
import path from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 10000;
const uri = process.env.MONGODB_URI || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";

const MPESA_ENV = process.env.MPESA_ENV || "sandbox";
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || "";
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || "";
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || "1745713";
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || "";
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || "";
const REGISTRATION_FEE = 300;
const DIRECT_REFERRAL_BONUS = Number(process.env.DIRECT_REFERRAL_BONUS || 50);
const INDIRECT_REFERRAL_BONUS = Number(process.env.INDIRECT_REFERRAL_BONUS || 30);

app.use(express.json());
app.use((req,res,next)=>{
  res.set("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma","no-cache");
  res.set("Expires","0");
  next();
});
app.use(express.static(path.join(__dirname,"public")));

const userSchema = new mongoose.Schema({
  name:String,
  email:{type:String,unique:true},
  phone:String,
  password:String,
  refCode:{type:String,unique:true},
  referredBy:String,
  balance:{type:Number,default:0},
  totalEarned:{type:Number,default:0},
  totalPaidOut:{type:Number,default:0}
},{timestamps:true});

const productSchema = new mongoose.Schema({
  name:String,
  description:String,
  price:Number,
  fileUrl:String,
  active:{type:Boolean,default:true}
},{timestamps:true});

const purchaseSchema = new mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  productId:{type:mongoose.Schema.Types.ObjectId,ref:"Product"},
  amount:Number,
  customerPhone:String,
  paymentMethod:{type:String,default:"M-Pesa"},
  mpesaReceipt:String,
  referrerId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  commission:{type:Number,default:0},
  commissionStatus:{type:String,default:"pending"},
  status:{type:String,default:"paid"},
  paidAt:Date
},{timestamps:true});

const payoutSchema = new mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  amount:Number,
  phone:String,
  status:{type:String,default:"pending"},
  reference:String,
  notes:String,
  paidAt:Date
},{timestamps:true});

/* A registration stays pending until Safaricom confirms the KSh 300 payment. */
const registrationSchema = new mongoose.Schema({
  name:String,
  email:{type:String},
  phone:String,
  password:String,
  refCode:String,
  checkoutRequestId:{type:String,index:true},
  merchantRequestId:String,
  mpesaReceipt:String,
  status:{type:String,default:"pending"}, // pending, paid, failed
  resultCode:Number,
  resultDescription:String,
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User"}
},{timestamps:true});

const User = mongoose.model("User",userSchema);
const Product = mongoose.model("Product",productSchema);
const Purchase = mongoose.model("Purchase",purchaseSchema);
const Payout = mongoose.model("Payout",payoutSchema);
const Registration = mongoose.model("Registration",registrationSchema);

const code = () => Math.random().toString(36).slice(2,9).toUpperCase();

function adminAuth(req,res,next){
  if(!ADMIN_KEY) return res.status(503).json({error:"ADMIN_KEY is not configured on the server. Add it in Render Environment."});
  if(req.get("X-Admin-Key") !== ADMIN_KEY) return res.status(401).json({error:"Invalid admin key"});
  next();
}

function normalizePhone(input){
  let p=String(input||"").replace(/\s+/g,"").replace(/^\+/,"");
  if(/^0\d{9}$/.test(p)) p="254"+p.slice(1);
  if(/^7\d{8}$/.test(p)) p="254"+p;
  return /^2547\d{8}$/.test(p) ? p : null;
}

function mpesaBase(){
  return MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

async function mpesaToken(){
  if(!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET)
    throw new Error("M-Pesa Consumer Key/Secret are not configured in Render.");
  const basic=Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
  const r=await fetch(`${mpesaBase()}/oauth/v1/generate?grant_type=client_credentials`,{
    headers:{Authorization:`Basic ${basic}`}
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok || !data.access_token) throw new Error(data.errorMessage||"Could not get M-Pesa access token.");
  return data.access_token;
}

async function initiateMpesaRegistration(phone, registrationId){
  if(!MPESA_PASSKEY) throw new Error("M-Pesa Passkey is not configured in Render.");
  if(!MPESA_CALLBACK_URL) throw new Error("MPESA_CALLBACK_URL is not configured in Render.");
  const token=await mpesaToken();
  const timestamp=new Date().toLocaleString("sv-SE",{timeZone:"Africa/Nairobi"}).replace(/[-: ]/g,"").slice(0,14);
  const password=Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString("base64");
  const body={
    BusinessShortCode:MPESA_SHORTCODE,
    Password:password,
    Timestamp:timestamp,
    TransactionType:"CustomerBuyGoodsOnline",
    Amount:REGISTRATION_FEE,
    PartyA:phone,
    PartyB:MPESA_SHORTCODE,
    PhoneNumber:phone,
    CallBackURL:MPESA_CALLBACK_URL,
    AccountReference:`GITS${String(registrationId).slice(-8)}`,
    TransactionDesc:"GITS Registration"
  };
  const r=await fetch(`${mpesaBase()}/mpesa/stkpush/v1/processrequest`,{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok || data.ResponseCode!=="0"){
    throw new Error(data.errorMessage||data.ResponseDescription||"M-Pesa STK request failed.");
  }
  return data;
}

async function finalizeRegistration(reg){
  if(reg.status==="paid" && reg.userId) return;
  if(await User.findOne({email:reg.email})) {
    reg.status="paid";
    reg.resultDescription="Account already exists.";
    await reg.save();
    return;
  }
  const ref=reg.refCode ? await User.findOne({refCode:reg.refCode}) : null;
  const u=await User.create({
    name:reg.name,email:reg.email,phone:reg.phone,password:reg.password,
    refCode:code(),referredBy:ref?.refCode||null
  });
  reg.userId=u._id;
  reg.status="paid";
  await reg.save();

  if(ref){
    ref.balance+=DIRECT_REFERRAL_BONUS;
    ref.totalEarned+=DIRECT_REFERRAL_BONUS;
    await ref.save();
    if(ref.referredBy){
      const second=await User.findOne({refCode:ref.referredBy});
      if(second){
        second.balance+=INDIRECT_REFERRAL_BONUS;
        second.totalEarned+=INDIRECT_REFERRAL_BONUS;
        await second.save();
      }
    }
  }
  return u;
}

app.get("/api/products",async(req,res)=>{try{
  const products=await Product.find({active:{$ne:false}}).sort({createdAt:-1}).lean();
  res.json(products);
}catch(e){res.status(500).json({error:e.message})}});

/* Start paid registration. The user is NOT created until the M-Pesa callback says success. */
app.post("/api/register",async(req,res)=>{try{
  const {name,email,phone,password,refCode}=req.body;
  if(!name||!email||!phone||!password)return res.status(400).json({error:"Name, email, phone and password are required"});
  if(await User.findOne({email}))return res.status(400).json({error:"Email already registered"});
  if(await Registration.findOne({email,status:"pending"}))return res.status(400).json({error:"A payment for this email is already pending. Complete it or wait for it to expire."});
  const msisdn=normalizePhone(phone);
  if(!msisdn)return res.status(400).json({error:"Enter a valid Safaricom number, e.g. 0712345678"});
  const ref=refCode?await User.findOne({refCode:refCode.trim().toUpperCase()}):null;
  if(refCode && !ref)return res.status(400).json({error:"Referral code not found"});
  const reg=await Registration.create({
    name:name.trim(),email:email.trim().toLowerCase(),phone:msisdn,password,refCode:ref?.refCode||null
  });
  try{
    const stk=await initiateMpesaRegistration(msisdn,reg._id);
    reg.checkoutRequestId=stk.CheckoutRequestID;
    reg.merchantRequestId=stk.MerchantRequestID;
    reg.resultDescription=stk.ResponseDescription||"STK Push sent";
    await reg.save();
    res.json({registrationId:reg._id,message:"STK Push sent. Enter your M-Pesa PIN on your phone.",checkoutRequestId:stk.CheckoutRequestID});
  }catch(err){
    reg.status="failed";
    reg.resultDescription=err.message;
    await reg.save();
    res.status(400).json({error:err.message});
  }
}catch(e){res.status(400).json({error:e.message})}});

app.get("/api/register/status/:id",async(req,res)=>{try{
  const reg=await Registration.findById(req.params.id);
  if(!reg)return res.status(404).json({error:"Registration not found"});
  if(reg.status==="paid"){
    const u=reg.userId?await User.findById(reg.userId):await User.findOne({email:reg.email});
    return res.json({status:"paid",id:u?u._id:null,name:u?.name,email:u?.email,refCode:u?.refCode});
  }
  res.json({status:reg.status,resultDescription:reg.resultDescription||"Waiting for M-Pesa confirmation."});
}catch(e){res.status(500).json({error:e.message})}});

/* Safaricom sends the STK result here. Only a successful callback activates the account. */
app.post("/api/mpesa/callback",async(req,res)=>{
  try{
    const stk=req.body?.Body?.stkCallback;
    if(!stk){
      return res.json({ResultCode:0,ResultDesc:"Accepted"});
    }
    const reg=await Registration.findOne({checkoutRequestId:stk.CheckoutRequestID});
    if(reg){
      reg.resultCode=Number(stk.ResultCode);
      reg.resultDescription=stk.ResultDesc||"";
      if(Number(stk.ResultCode)===0){
        const items=stk.CallbackMetadata?.Item||[];
        const receipt=items.find(x=>x.Name==="MpesaReceiptNumber")?.Value;
        const amount=Number(items.find(x=>x.Name==="Amount")?.Value||0);
        reg.mpesaReceipt=receipt||"";
        if(amount===REGISTRATION_FEE){
          await finalizeRegistration(reg);
        }else{
          reg.status="failed";
          reg.resultDescription="Payment amount did not match the GITS registration fee.";
          await reg.save();
        }
      }else{
        reg.status="failed";
        await reg.save();
      }
    }
    return res.json({ResultCode:0,ResultDesc:"Accepted"});
  }catch(e){
    console.error("M-Pesa callback error:",e);
    return res.json({ResultCode:0,ResultDesc:"Accepted"});
  }
});

app.post("/api/login",async(req,res)=>{
  const u=await User.findOne({email:req.body.email,password:req.body.password});
  if(!u)return res.status(401).json({error:"Invalid email or password"});
  res.json({id:u._id,name:u.name,email:u.email,refCode:u.refCode,balance:u.balance,totalEarned:u.totalEarned});
});

app.get("/api/dashboard/:id",async(req,res)=>{try{
  const u=await User.findById(req.params.id);
  if(!u)return res.status(404).json({error:"User not found"});
  const referrals=await User.countDocuments({referredBy:u.refCode});
  const purchases=await Purchase.find({userId:u._id}).populate("productId").sort({createdAt:-1});
  res.json({user:{name:u.name,email:u.email,phone:u.phone,refCode:u.refCode,balance:u.balance,totalEarned:u.totalEarned,totalPaidOut:u.totalPaidOut},referrals,purchases});
}catch(e){res.status(500).json({error:e.message})}});

/* Existing demo purchase endpoint kept for document testing. It is not used for registration. */
app.post("/api/purchase-demo",async(req,res)=>{try{
  const u=await User.findById(req.body.userId),p=await Product.findById(req.body.productId);
  if(!u||!p)return res.status(404).json({error:"User or product not found"});
  let commission=0,referrer=null;
  if(u.referredBy)referrer=await User.findOne({refCode:u.referredBy});
  if(referrer){commission=Math.round(p.price*0.1667);}
  const purchase=await Purchase.create({
    userId:u._id,productId:p._id,amount:p.price,customerPhone:req.body.phone||u.phone||"",
    paymentMethod:"M-Pesa",referrerId:referrer?._id,commission,
    commissionStatus:commission?"pending":"none",status:"paid",paidAt:new Date()
  });
  if(referrer){
    referrer.balance+=commission;referrer.totalEarned+=commission;await referrer.save();
    purchase.commissionStatus="credited";await purchase.save();
  }
  res.json({message:"Demo purchase recorded",purchaseId:purchase._id,commission});
}catch(e){res.status(400).json({error:e.message})}});

app.get("/api/admin/products",adminAuth,async(req,res)=>res.json(await Product.find().sort({createdAt:-1})));
app.post("/api/admin/products",adminAuth,async(req,res)=>{try{
  res.json(await Product.create({name:req.body.name,description:req.body.description,price:Number(req.body.price),fileUrl:req.body.fileUrl||""}));
}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/admin/products/:id",adminAuth,async(req,res)=>{try{
  const product=await Product.findById(req.params.id);
  if(!product)return res.status(404).json({error:"Document not found"});
  if(req.body.name!==undefined)product.name=String(req.body.name).trim();
  if(req.body.description!==undefined)product.description=String(req.body.description);
  if(req.body.price!==undefined){const price=Number(req.body.price);if(!Number.isFinite(price)||price<0)return res.status(400).json({error:"Enter a valid price"});product.price=price;}
  if(req.body.fileUrl!==undefined)product.fileUrl=String(req.body.fileUrl);
  if(req.body.active!==undefined)product.active=req.body.active!==false;
  await product.save();res.json(product);
}catch(e){res.status(400).json({error:e.message})}});
app.delete("/api/admin/products/:id",adminAuth,async(req,res)=>{try{
  const product=await Product.findById(req.params.id);if(!product)return res.status(404).json({error:"Document not found"});
  product.active=false;await product.save();res.json({message:"Document deleted from the customer site",product});
}catch(e){res.status(400).json({error:e.message})}});

app.get("/api/admin/stats",adminAuth,async(req,res)=>{try{
  const [users,purchases,paidAgg,commissionAgg,pendingPayoutAgg,payoutAgg,products]=await Promise.all([
    User.countDocuments(),Purchase.countDocuments(),
    Purchase.aggregate([{$match:{status:"paid"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
    Purchase.aggregate([{$match:{status:"paid",commission:{$gt:0}}},{$group:{_id:null,total:{$sum:"$commission"}}}]),
    Payout.aggregate([{$match:{status:"pending"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
    Payout.aggregate([{$match:{status:"paid"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
    Product.countDocuments({active:{$ne:false}})
  ]);
  res.json({users,purchases,products,totalSales:paidAgg[0]?.total||0,totalCommissions:commissionAgg[0]?.total||0,pendingPayouts:pendingPayoutAgg[0]?.total||0,paidOut:payoutAgg[0]?.total||0});
}catch(e){res.status(500).json({error:e.message})}});

app.get("/api/admin/payments",adminAuth,async(req,res)=>{try{
  const rows=await Purchase.find().populate("userId","name email phone refCode").populate("productId","name price").populate("referrerId","name email phone").sort({createdAt:-1}).limit(500);
  res.json(rows);
}catch(e){res.status(500).json({error:e.message})}});
app.put("/api/admin/payments/:id",adminAuth,async(req,res)=>{try{
  const p=await Purchase.findById(req.params.id);if(!p)return res.status(404).json({error:"Payment not found"});
  if(req.body.status)p.status=req.body.status;if(req.body.mpesaReceipt!==undefined)p.mpesaReceipt=req.body.mpesaReceipt;
  if(req.body.commissionStatus)p.commissionStatus=req.body.commissionStatus;if(p.status==="paid"&&!p.paidAt)p.paidAt=new Date();
  await p.save();res.json(p);
}catch(e){res.status(400).json({error:e.message})}});

app.get("/api/admin/users",adminAuth,async(req,res)=>{try{
  const users=await User.find().select("-password").sort({createdAt:-1}).lean();
  const enriched=await Promise.all(users.map(async u=>({...u,referrals:await User.countDocuments({referredBy:u.refCode})})));
  res.json(enriched);
}catch(e){res.status(500).json({error:e.message})}});
app.get("/api/admin/commissions",adminAuth,async(req,res)=>{try{
  const rows=await Purchase.find({commission:{$gt:0}}).populate("userId","name email").populate("referrerId","name email phone refCode").populate("productId","name").sort({createdAt:-1}).limit(500);
  res.json(rows);
}catch(e){res.status(500).json({error:e.message})}});

app.get("/api/admin/payouts",adminAuth,async(req,res)=>{try{
  const rows=await Payout.find().populate("userId","name email phone balance").sort({createdAt:-1}).limit(500);res.json(rows);
}catch(e){res.status(500).json({error:e.message})}});
app.post("/api/admin/payouts",adminAuth,async(req,res)=>{try{
  const u=await User.findById(req.body.userId),amount=Number(req.body.amount);
  if(!u)return res.status(404).json({error:"User not found"});if(!amount||amount<=0)return res.status(400).json({error:"Enter a valid payout amount"});
  if(amount>u.balance)return res.status(400).json({error:"Payout amount is greater than the user's available balance"});
  res.json(await Payout.create({userId:u._id,amount,phone:req.body.phone||u.phone||"",status:"pending",notes:req.body.notes||""}));
}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/admin/payouts/:id",adminAuth,async(req,res)=>{try{
  const payout=await Payout.findById(req.params.id).populate("userId");if(!payout)return res.status(404).json({error:"Payout not found"});
  if(req.body.reference!==undefined)payout.reference=req.body.reference;if(req.body.notes!==undefined)payout.notes=req.body.notes;
  if(req.body.status==="paid"&&payout.status!=="paid"){
    const u=await User.findById(payout.userId._id);if(!u)return res.status(404).json({error:"User not found"});
    if(payout.amount>u.balance)return res.status(400).json({error:"User no longer has enough balance for this payout"});
    u.balance-=payout.amount;u.totalPaidOut=(u.totalPaidOut||0)+payout.amount;await u.save();payout.status="paid";payout.paidAt=new Date();
  }else if(req.body.status)payout.status=req.body.status;
  await payout.save();res.json(payout);
}catch(e){res.status(400).json({error:e.message})}});

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public/admin.html")));

async function start(){
  if(uri){
    try{
      await mongoose.connect(uri);
      console.log("MongoDB connected");
      if(await Product.countDocuments()===0)await Product.insertMany([
        {name:"KCSE Mathematics Revision Pack",description:"Sample revision package. Replace with material you have rights to distribute.",price:300},
        {name:"Teacher Lesson Plan Bundle",description:"Sample teaching-resource bundle.",price:300},
        {name:"CBC Revision Notes",description:"Sample educational notes.",price:250}
      ]);
    }catch(e){console.error("MongoDB connection failed:",e.message)}
  }else console.log("MONGODB_URI not set");
  app.listen(PORT,()=>console.log(`GITS is running on port ${PORT}`));
}
start();
