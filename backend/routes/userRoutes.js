import express from "express";
import { register, authenticate } from "../services/authService.js";
import { verifyToken } from "../middleware/verifyToken.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserTypeModel } from "../models/userModel.js";

export const userRoute = express.Router();

// Registration route
userRoute.post(["/register", "/register/"], async (req, res) => {
  try {
    const user = await register(req.body);

    res.status(201).json({
      success: true,
      user,
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
});

// Login route
userRoute.post(["/login", "/login/"], async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await authenticate(email, password);

    res.cookie("token", result.token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
});

// Logout route
userRoute.post(["/logout", "/logout/"], (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: false, // true in production (HTTPS)
    sameSite: "lax",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

// Profile / Current User route
userRoute.get(["/me", "/me/"], verifyToken, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

// Update Profile route
userRoute.put(["/update-profile", "/update-profile/"], verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, currentPassword, newPassword } = req.body;

    const user = await UserTypeModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update fields if provided
    if (firstName) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;

    // Password modification flow
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password is required to change password",
        });
      }

      const isMatched = await bcrypt.compare(currentPassword, user.password);
      if (!isMatched) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      user.password = await bcrypt.hash(newPassword, 12);
    }

    await user.save();

    // Sign a new token reflecting the name updates
    const newToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      process.env.JWT_SECRET_KEY,
      {
        expiresIn: "30d",
      }
    );

    // Set secure cookie
    res.cookie("token", newToken, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const userObj = user.toObject();
    delete userObj.password;

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      token: newToken,
      user: userObj,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

