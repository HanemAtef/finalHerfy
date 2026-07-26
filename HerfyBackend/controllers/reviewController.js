const Review=require("../models/Review");
const Handyman=require("../models/Handyman");
const User=require("../models/User");
const Order=require("../models/Order")

//add review
const addReview =async(req,res)=>{
    try{

        const {rating,comment,orderId}= req.body;
        //check for existing order
        const order= await Order.findById(orderId);
        if(!order) return res.status(404).json({msg: "Order not found"})
            //chech for status of odrder
        if (order.status !== "completed") {
      return res.status(400).json({ msg: "You can only review completed orders" });
    }

    //check for user if he write the comment
       if (order.customerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: "You are not authorized to review this order" });
    }

    //check for if the comment is exist
   const existingReview = await Review.findOne({ orderId });
    if (existingReview) {
        return res.status(400).json({ msg: "You have already reviewed this order" });
    }
    //add review
const review = await Review.create({
      orderId,
      handymanId: order.handymanId,
      customerId: req.user.id,
      rating,
      comment,
    });

    //update rating
    const allReviews = await Review.find({ handymanId: order.handymanId });
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await Handyman.findOneAndUpdate(
      { userId: order.handymanId },
      { rating: avgRating }
    );

    res.status(201).json({
      msg: "Review added successfully",
      review,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

///////////////////////////////////////////////////////////
const getHandymanReviews = async (req, res) => {
  try {
    const { handymanId } = req.params;

    const reviews = await Review.find({ handymanId })
      .populate("customerId", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({msg:"all reviews",data:reviews});
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};
//////////////////////////////////////////////////
const getCustomersReviews= async(req,res)=>{
  try{
    const {customerId}=req.params;
       if (req.user.id !== customerId && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You can only view your own reviews" });
    }
    const reviews=await Review.find({customerId}).populate("handymanId","name profession");
    res.status(200).json({msg:"all reviews",data:reviews})
  }
 catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};
///////////////////////////////////////////////


module.exports = { addReview, getHandymanReviews,getCustomersReviews };
