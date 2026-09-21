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

const User = mongoose.model("User",userSchema);
const Product = mongoose.model("Product",productSchema);
const Purchase = mongoose.model("Purchase",purchaseSchema);
const Payout = mongoose.model("Payout",payoutSchema);

const code = () => Math.random().toString(36).slice(2,9).toUpperCase();

function adminAuth(req,res,next){
  if(!ADMIN_KEY) return res.status(503).json({error:"ADMIN_KEY is not configured on the server. Add it in Render Environment."});
  if(req.get("X-Admin-Key") !== ADMIN_KEY) return res.status(401).json({error:"Invalid admin key"});
  next();
}

app.get("/api/products",async(req,res)=>{try{
  const products=await Product.find({active:{$ne:false}}).sort({createdAt:-1}).lean();
  res.json(products);
}catch(e){res.status(500).json({error:e.message})}});

app.post("/api/register",async(req,res)=>{try{
  const {name,email,phone,password,refCode}=req.body;
  if(!name||!email||!password)return res.status(400).json({error:"Name, email and password are required"});
  if(await User.findOne({email}))return res.status(400).json({error:"Email already registered"});
  const ref=refCode?await User.findOne({refCode}):null;
  const u=await User.create({name,email,phone,password,refCode:code(),referredBy:ref?.refCode||null});
  res.json({id:u._id,name:u.name,email:u.email,refCode:u.refCode});
}catch(e){res.status(400).json({error:e.message})}});

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

// Demo purchase endpoint. This records a payment as paid; it is NOT a live M-Pesa API.
app.post("/api/purchase-demo",async(req,res)=>{try{
  const u=await User.findById(req.body.userId),p=await Product.findById(req.body.productId);
  if(!u||!p)return res.status(404).json({error:"User or product not found"});
  let commission=0,referrer=null;
  if(u.referredBy)referrer=await User.findOne({refCode:u.referredBy});
  if(referrer){commission=Math.round(p.price*0.1667);}
  const purchase=await Purchase.create({
    userId:u._id,
    productId:p._id,
    amount:p.price,
    customerPhone:req.body.phone||u.phone||"",
    paymentMethod:"M-Pesa",
    referrerId:referrer?._id,
    commission,
    commissionStatus:commission?"pending":"none",
    status:"paid",
    paidAt:new Date()
  });
  if(referrer){
    referrer.balance+=commission;
    referrer.totalEarned+=commission;
    await referrer.save();
    purchase.commissionStatus="credited";
    await purchase.save();
  }
  res.json({message:"Demo purchase recorded",purchaseId:purchase._id,commission});
}catch(e){res.status(400).json({error:e.message})}});

// Admin document management
app.get("/api/admin/products",adminAuth,async(req,res)=>res.json(await Product.find().sort({createdAt:-1})));
app.post("/api/admin/products",adminAuth,async(req,res)=>{try{
  res.json(await Product.create({name:req.body.name,description:req.body.description,price:Number(req.body.price),fileUrl:req.body.fileUrl||""}));
}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/admin/products/:id",adminAuth,async(req,res)=>{try{
  res.json(await Product.findByIdAndUpdate(req.params.id,{name:req.body.name,description:req.body.description,price:Number(req.body.price),fileUrl:req.body.fileUrl||"",active:req.body.active!==false},{new:true}));
}catch(e){res.status(400).json({error:e.message})}});

// Admin dashboard statistics
app.get("/api/admin/stats",adminAuth,async(req,res)=>{try{
  const [users,purchases,paidAgg,commissionAgg,pendingPayoutAgg,payoutAgg,products] = await Promise.all([
    User.countDocuments(),
    Purchase.countDocuments(),
    Purchase.aggregate([{$match:{status:"paid"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
    Purchase.aggregate([{$match:{status:"paid",commission:{$gt:0}}},{$group:{_id:null,total:{$sum:"$commission"}}}]),
    Payout.aggregate([{$match:{status:"pending"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
    Payout.aggregate([{$match:{status:"paid"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
    Product.countDocuments({active:{$ne:false}})
  ]);
  res.json({
    users,
    purchases,
    products,
    totalSales:paidAgg[0]?.total||0,
    totalCommissions:commissionAgg[0]?.total||0,
    pendingPayouts:pendingPayoutAgg[0]?.total||0,
    paidOut:payoutAgg[0]?.total||0
  });
}catch(e){res.status(500).json({error:e.message})}});

// Admin payments
app.get("/api/admin/payments",adminAuth,async(req,res)=>{try{
  const rows=await Purchase.find().populate("userId","name email phone refCode").populate("productId","name price").populate("referrerId","name email phone").sort({createdAt:-1}).limit(500);
  res.json(rows);
}catch(e){res.status(500).json({error:e.message})}});

app.put("/api/admin/payments/:id",adminAuth,async(req,res)=>{try{
  const p=await Purchase.findById(req.params.id);
  if(!p)return res.status(404).json({error:"Payment not found"});
  if(req.body.status) p.status=req.body.status;
  if(req.body.mpesaReceipt!==undefined) p.mpesaReceipt=req.body.mpesaReceipt;
  if(req.body.commissionStatus) p.commissionStatus=req.body.commissionStatus;
  if(p.status==="paid"&&!p.paidAt)p.paidAt=new Date();
  await p.save();
  res.json(p);
}catch(e){res.status(400).json({error:e.message})}});

// Admin users and referral information
app.get("/api/admin/users",adminAuth,async(req,res)=>{try{
  const users=await User.find().select("-password").sort({createdAt:-1}).lean();
  const enriched=await Promise.all(users.map(async u=>({
    ...u,
    referrals:await User.countDocuments({referredBy:u.refCode})
  })));
  res.json(enriched);
}catch(e){res.status(500).json({error:e.message})}});

app.get("/api/admin/commissions",adminAuth,async(req,res)=>{try{
  const rows=await Purchase.find({commission:{$gt:0}})
    .populate("userId","name email")
    .populate("referrerId","name email phone refCode")
    .populate("productId","name")
    .sort({createdAt:-1}).limit(500);
  res.json(rows);
}catch(e){res.status(500).json({error:e.message})}});

// Admin payout management. Creating a payout reserves the amount; marking it paid records the payout.
app.get("/api/admin/payouts",adminAuth,async(req,res)=>{try{
  const rows=await Payout.find().populate("userId","name email phone balance").sort({createdAt:-1}).limit(500);
  res.json(rows);
}catch(e){res.status(500).json({error:e.message})}});

app.post("/api/admin/payouts",adminAuth,async(req,res)=>{try{
  const u=await User.findById(req.body.userId);
  const amount=Number(req.body.amount);
  if(!u)return res.status(404).json({error:"User not found"});
  if(!amount||amount<=0)return res.status(400).json({error:"Enter a valid payout amount"});
  if(amount>u.balance)return res.status(400).json({error:"Payout amount is greater than the user's available balance"});
  const payout=await Payout.create({userId:u._id,amount,phone:req.body.phone||u.phone||"",status:"pending",notes:req.body.notes||""});
  res.json(payout);
}catch(e){res.status(400).json({error:e.message})}});

app.put("/api/admin/payouts/:id",adminAuth,async(req,res)=>{try{
  const payout=await Payout.findById(req.params.id).populate("userId");
  if(!payout)return res.status(404).json({error:"Payout not found"});
  if(req.body.reference!==undefined)payout.reference=req.body.reference;
  if(req.body.notes!==undefined)payout.notes=req.body.notes;
  if(req.body.status==="paid"&&payout.status!=="paid"){
    const u=await User.findById(payout.userId._id);
    if(!u)return res.status(404).json({error:"User not found"});
    if(payout.amount>u.balance)return res.status(400).json({error:"User no longer has enough balance for this payout"});
    u.balance-=payout.amount;
    u.totalPaidOut=(u.totalPaidOut||0)+payout.amount;
    await u.save();
    payout.status="paid";
    payout.paidAt=new Date();
  }else if(req.body.status) payout.status=req.body.status;
  await payout.save();
  res.json(payout);
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
