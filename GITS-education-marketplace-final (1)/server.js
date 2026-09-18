import express from "express";
import mongoose from "mongoose";
import path from "path";
import {fileURLToPath} from "url";
const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename);
const app=express(); const PORT=process.env.PORT||10000;
app.use(express.json());
app.use((req,res,next)=>{res.set("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");res.set("Pragma","no-cache");res.set("Expires","0");next();});
app.use(express.static(path.join(__dirname,"public")));
const uri=process.env.MONGODB_URI||"";
const userSchema=new mongoose.Schema({name:String,email:{type:String,unique:true},phone:String,password:String,refCode:{type:String,unique:true},referredBy:String,balance:{type:Number,default:0},totalEarned:{type:Number,default:0}},{timestamps:true});
const productSchema=new mongoose.Schema({name:String,description:String,price:Number,fileUrl:String,active:{type:Boolean,default:true}},{timestamps:true});
const purchaseSchema=new mongoose.Schema({userId:mongoose.Schema.Types.ObjectId,productId:mongoose.Schema.Types.ObjectId,amount:Number,referrerId:mongoose.Schema.Types.ObjectId,commission:Number,status:{type:String,default:"paid"}},{timestamps:true});
const User=mongoose.model("User",userSchema),Product=mongoose.model("Product",productSchema),Purchase=mongoose.model("Purchase",purchaseSchema);
const code=()=>Math.random().toString(36).slice(2,9).toUpperCase();
app.get("/api/products",async(req,res)=>{try{
 const products=await Product.find({active:{$ne:false}}).sort({createdAt:-1}).lean();
 res.json(products);
}catch(e){res.status(500).json({error:e.message})}});
app.post("/api/register",async(req,res)=>{try{
 const {name,email,phone,password,refCode}=req.body;if(!name||!email||!password)return res.status(400).json({error:"Name, email and password are required"});
 if(await User.findOne({email}))return res.status(400).json({error:"Email already registered"});
 const ref=refCode?await User.findOne({refCode}):null;
 const u=await User.create({name,email,phone,password,refCode:code(),referredBy:ref?.refCode||null});
 res.json({id:u._id,name:u.name,email:u.email,refCode:u.refCode});
}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/login",async(req,res)=>{const u=await User.findOne({email:req.body.email,password:req.body.password});if(!u)return res.status(401).json({error:"Invalid email or password"});res.json({id:u._id,name:u.name,email:u.email,refCode:u.refCode,balance:u.balance,totalEarned:u.totalEarned})});
app.get("/api/dashboard/:id",async(req,res)=>{try{
 const u=await User.findById(req.params.id);if(!u)return res.status(404).json({error:"User not found"});
 const referrals=await User.countDocuments({referredBy:u.refCode});
 const purchases=await Purchase.find({userId:u._id}).populate("productId");
 res.json({user:{name:u.name,email:u.email,refCode:u.refCode,balance:u.balance,totalEarned:u.totalEarned},referrals,purchases});
}catch(e){res.status(500).json({error:e.message})}});
app.post("/api/purchase-demo",async(req,res)=>{try{
 const u=await User.findById(req.body.userId),p=await Product.findById(req.body.productId);if(!u||!p)return res.status(404).json({error:"User or product not found"});
 let commission=0,referrer=null;
 if(u.referredBy)referrer=await User.findOne({refCode:u.referredBy});
 if(referrer){commission=Math.round(p.price*0.1667);referrer.balance+=commission;referrer.totalEarned+=commission;await referrer.save();}
 const purchase=await Purchase.create({userId:u._id,productId:p._id,amount:p.price,referrerId:referrer?._id,commission});
 res.json({message:"Demo purchase recorded",purchaseId:purchase._id,commission});
}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/admin/products",async(req,res)=>res.json(await Product.find().sort({createdAt:-1})));
app.post("/api/admin/products",async(req,res)=>{try{res.json(await Product.create({name:req.body.name,description:req.body.description,price:Number(req.body.price),fileUrl:req.body.fileUrl||""}))}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/admin/products/:id",async(req,res)=>{try{res.json(await Product.findByIdAndUpdate(req.params.id,{name:req.body.name,description:req.body.description,price:Number(req.body.price),fileUrl:req.body.fileUrl||"",active:req.body.active!==false},{new:true}))}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/admin/users",async(req,res)=>res.json(await User.find().select("-password").sort({createdAt:-1})));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public/admin.html")));
async function start(){if(uri){try{await mongoose.connect(uri);console.log("MongoDB connected");
if(await Product.countDocuments()===0)await Product.insertMany([
{name:"KCSE Mathematics Revision Pack",description:"Sample revision package. Replace with material you have rights to distribute.",price:300},
{name:"Teacher Lesson Plan Bundle",description:"Sample teaching-resource bundle.",price:300},
{name:"CBC Revision Notes",description:"Sample educational notes.",price:250}]);}catch(e){console.error("MongoDB connection failed:",e.message)}}else console.log("MONGODB_URI not set");
app.listen(PORT,()=>console.log(`GITS is running on port ${PORT}`));}
start();