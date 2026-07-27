    const Order = require("../models/Order");
    const Review = require("../models/Review");
    const User = require("../models/User");

    // ========== customers stat==========
    const getCustomerStats = async (req, res) => {
    try {
        const { customerId } = req.params;

    
        if (req.user.id !== customerId && req.user.role !== "admin") {
        return res.status(403).json({ msg: "You can only view your own stats" });
        }

        // orders number
        const totalOrders = await Order.countDocuments({ customerId });
        const completedOrders = await Order.countDocuments({ customerId, status: "completed" });
        const pendingOrders = await Order.countDocuments({ customerId, status: "pending" });
        const cancelledOrders = await Order.countDocuments({ customerId, status: "cancelled" });

        // reviews number
        const totalReviews = await Review.countDocuments({ customerId });

        //customers info
        const customer = await User.findById(customerId).select("-password");

        res.status(200).json({
        totalOrders,
        completedOrders,
        pendingOrders,
        cancelledOrders,
        totalReviews,
        customer: {
            id: customer._id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            location: customer.location,
        },
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    module.exports = { getCustomerStats };