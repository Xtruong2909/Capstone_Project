import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { Mail, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, X, KeyRound } from "lucide-react";
import "./LoginPage.css";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  // State màn hình chính (Gửi Email)
  const [email, setEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // State Popup Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState("otp"); // 'otp' | 'password' | 'success'
  const [modalError, setModalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State nhập mã OTP (6 số)
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef([]);
  const [resendCountdown, setResendCountdown] = useState(60);

  // state lưu resetToken
  const [resetToken, setResetToken] = useState("");
  // State nhập mật khẩu mới
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Đếm ngược gửi lại mã OTP
  useEffect(() => {
    let timer;
    if (isModalOpen && resendCountdown > 0) {
      timer = setInterval(() => setResendCountdown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isModalOpen, resendCountdown]);

  // 1. Submit Email -> Mở Modal nhập OTP
  const handleSendEmail = async (e) => {
  e.preventDefault();
  setIsSendingEmail(true);
  try {
    await authService.forgotPassword(email);
    setIsModalOpen(true);
    setModalStep("otp");
    setResendCountdown(60);
    setModalError("");
  } catch (err) {
    alert(err.response?.data?.detail || "Email không tồn tại trong hệ thống!");
  } finally {
    setIsSendingEmail(false);
  }
};

  // Xử lý sự kiện gõ 6 ô OTP
  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1); // lấy ký tự cuối
    setOtp(newOtp);

    // Tự động nhảy sang ô tiếp theo
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // Nhấn Backspace tự động lùi về ô trước
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // 2. Xác thực OTP
  const handleVerifyOtp = async (e) => {
  e.preventDefault();
  const fullOtp = otp.join("");
  if (fullOtp.length < 6) {
    setModalError("Vui lòng nhập đủ 6 số OTP.");
    return;
  }
  setIsSubmitting(true);
  try {
    const res = await authService.verifyOtp({ email, otp: fullOtp });
    setResetToken(res.reset_token);
    setModalStep("password");
  } catch (err) {
    setModalError(err.response?.data?.detail || "Mã OTP không đúng hoặc đã hết hạn.");
  } finally {
    setIsSubmitting(false);
  }
};

  // 3. Đổi mật khẩu mới
  const handleResetPassword = async (e) => {
  e.preventDefault();
  if (newPassword.length < 6) {
    setModalError("Mật khẩu mới phải từ 6 ký tự trở lên.");
    return;
  }
  if (newPassword !== confirmPassword) {
    setModalError("Mật khẩu xác nhận không khớp!");
    return;
  }
  setIsSubmitting(true);
  try {
    await authService.resetPassword({
      email,
      reset_token: resetToken,
      new_password: newPassword,
    });
    setModalStep("success");
    setTimeout(() => {
      setIsModalOpen(false);
      navigate("/login");
    }, 2500);
  } catch (err) {
    setModalError(err.response?.data?.detail || "Không thể đặt lại mật khẩu.");
  } finally {
    setIsSubmitting(false);
  }
};

  // Gửi lại mã OTP
  const handleResendOtp = () => {
    if (resendCountdown > 0) return;
    setResendCountdown(60);
    setOtp(["", "", "", "", "", ""]);
    otpRefs.current[0]?.focus();
    // Giả lập gửi lại
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Cột trái: Branding */}
        <section className="login-brand-panel">
          <div className="brand-overlay">
            <div className="brand-logo">
              <div className="brand-logo-mark">A</div>
              <div>
                <h1>Urban Traffic</h1>
                <h2>Analytics</h2>
                <span>Traffic Dataset Management & Forecasting</span>
              </div>
            </div>

            <div className="brand-content">
              <h3>Account Recovery</h3>
              <p>
                Enter your email address and we'll send a 6-digit verification code to reset your password.
              </p>
            </div>
          </div>
        </section>

        {/* Cột phải: Form nhập Email */}
        <section className="login-form-panel">
          <button
            type="button"
            className="login-back-home"
            onClick={() => navigate("/login")}
          >
            ← Back to Sign In
          </button>

          <div className="login-form-content">
            <h2>Forgot Password?</h2>
            <p className="login-description">
              No worries! Enter your registered email address below to receive an OTP verification code.
            </p>

            <form onSubmit={handleSendEmail}>
              <div className="form-group">
                <label htmlFor="auth-email">Email Address</label>
                <div className="input-wrapper">
                  <Mail size={18} />
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. admin@metroflow.ai"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="login-submit"
                disabled={isSendingEmail}
                style={{ marginTop: "20px" }}
              >
                {isSendingEmail ? "Sending Code..." : "Send Verification Code"}
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* ==================================
          POPUP MODAL: NHẬP OTP & ĐỔI MẬT KHẨU
         ================================== */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            {/* Nút đóng modal */}
            {modalStep !== "success" && (
              <button
                className="modal-close-btn"
                aria-label="Close"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={20} />
              </button>
            )}

            {/* BƯỚC 1: NHẬP MÃ OTP */}
            {modalStep === "otp" && (
              <div>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <div style={{ width: "48px", height: "48px", background: "#e0edff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: "#1264f5" }}>
                    <KeyRound size={24} />
                  </div>
                  <h3 style={{ fontSize: "1.25rem", margin: "0 0 6px" }}>Enter Verification Code</h3>
                  <p style={{ color: "#64748b", fontSize: "0.88rem", margin: 0 }}>
                    We've sent a 6-digit code to <strong>{email}</strong>
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp}>
                  <div className="otp-container">
                    {otp.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (otpRefs.current[idx] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        className="otp-box"
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e.target.value ? e : e)}
                        autoFocus={idx === 0}
                      />
                    ))}
                  </div>

                  {modalError && (
                    <p className="login-error" role="alert" style={{ textAlign: "center", marginBottom: "12px" }}>
                      {modalError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="login-submit"
                    disabled={isSubmitting}
                    style={{ width: "100%", marginTop: "12px" }}
                  >
                    {isSubmitting ? "Verifying..." : "Verify OTP"}
                  </button>

                  <div className="resend-text">
                    Didn't receive code?{" "}
                    <button
                      type="button"
                      className="resend-btn"
                      disabled={resendCountdown > 0}
                      onClick={handleResendOtp}
                    >
                      {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend OTP"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* BƯỚC 2: NHẬP MẬT KHẨU MỚI */}
            {modalStep === "password" && (
              <div>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "1.25rem", margin: "0 0 6px" }}>Set New Password</h3>
                  <p style={{ color: "#64748b", fontSize: "0.88rem", margin: 0 }}>
                    OTP verified! Create your new secure password.
                  </p>
                </div>

                <form onSubmit={handleResetPassword}>
                  <div className="form-group">
                    <label htmlFor="modal-new-pwd">New Password</label>
                    <div className="input-wrapper">
                      <Lock size={18} />
                      <input
                        id="modal-new-pwd"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowNewPassword((p) => !p)}
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: "14px" }}>
                    <label htmlFor="modal-confirm-pwd">Confirm New Password</label>
                    <div className="input-wrapper">
                      <Lock size={18} />
                      <input
                        id="modal-confirm-pwd"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        required
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowConfirmPassword((p) => !p)}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {modalError && (
                    <p className="login-error" role="alert" style={{ marginTop: "12px" }}>
                      <AlertCircle size={16} style={{ display: "inline", marginRight: "6px" }} />
                      {modalError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="login-submit"
                    disabled={isSubmitting}
                    style={{ width: "100%", marginTop: "20px" }}
                  >
                    {isSubmitting ? "Updating..." : "Update Password"}
                  </button>
                </form>
              </div>
            )}

            {/* BƯỚC 3: THÀNH CÔNG */}
            {modalStep === "success" && (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <CheckCircle2 size={54} color="#22c55e" style={{ margin: "0 auto 14px" }} />
                <h3 style={{ fontSize: "1.25rem", marginBottom: "8px" }}>Password Changed!</h3>
                <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: "20px" }}>
                  Your password has been successfully updated. Redirecting you to the sign-in page...
                </p>
                <button
                  type="button"
                  className="login-submit"
                  onClick={() => {
                    setIsModalOpen(false);
                    navigate("/login");
                  }}
                >
                  Go to Sign In Now
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}