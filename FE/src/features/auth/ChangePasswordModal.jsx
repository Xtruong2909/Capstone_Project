import { useState, useRef, useEffect } from "react";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, X, KeyRound } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { authService } from "../../services/authService";
import "./LoginPage.css"; // Tái sử dụng CSS Modal sẵn có

export default function ChangePasswordModal({ isOpen, onClose }) {
  const { user } = useAuth();

  // State các bước: 'otp' | 'password' | 'success'
  const [step, setStep] = useState("otp");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // State OTP
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef([]);
  const [resendTimer, setResendTimer] = useState(60);
  const [resetToken, setResetToken] = useState("");

  // State mật khẩu mới
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 1. Khi mở Modal: Tự động gửi OTP về email của tài khoản đang đăng nhập
  useEffect(() => {
    if (isOpen && user?.email) {
      setStep("otp");
      setError("");
      setOtp(["", "", "", "", "", ""]);
      setResendTimer(60);
      setNewPassword("");
      setConfirmPassword("");

      // Gửi OTP ngay khi mở popup
      authService.forgotPassword(user.email).catch((err) => {
        setError(err.response?.data?.detail || "Không thể gửi mã OTP.");
      });
    }
  }, [isOpen, user?.email]);

  // Bộ đếm ngược gửi lại OTP
  useEffect(() => {
    let interval;
    if (isOpen && resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isOpen, resendTimer]);

  if (!isOpen) return null;

  // Xử lý gõ 6 ô OTP
  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Gửi lại mã OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    try {
      await authService.forgotPassword(user.email);
      setResendTimer(60);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Gửi lại OTP thất bại.");
    }
  };

  // Bước 1: Xác thực OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const fullOtp = otp.join("");
    if (fullOtp.length < 6) {
      setError("Vui lòng nhập đủ 6 chữ số OTP.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await authService.verifyOtp({ email: user.email, otp: fullOtp });
      setResetToken(res.reset_token);
      setStep("password"); // Chuyển sang bước nhập mật khẩu mới
    } catch (err) {
      setError(err.response?.data?.detail || "Mã OTP không đúng hoặc đã hết hạn.");
    } finally {
      setIsLoading(false);
    }
  };

  // Bước 2: Cập nhật mật khẩu mới
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Mật khẩu mới phải từ 6 ký tự trở lên.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp!");
      return;
    }

    setIsLoading(true);

    try {
      await authService.resetPassword({
        email: user.email,
        reset_token: resetToken,
        new_password: newPassword,
      });

      setStep("success");
      // Tự động đóng popup sau 2 giây
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Cập nhật mật khẩu thất bại.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        {/* Nút đóng modal */}
        {step !== "success" && (
          <button className="modal-close-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        )}

        {/* ==================== BƯỚC 1: NHẬP OTP ==================== */}
        {step === "otp" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ width: "48px", height: "48px", background: "#e0edff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: "#1264f5" }}>
                <KeyRound size={24} />
              </div>
              <h3 style={{ fontSize: "1.25rem", margin: "0 0 6px" }}>Xác thực Đổi mật khẩu</h3>
              <p style={{ color: "#64748b", fontSize: "0.88rem", margin: 0 }}>
                Mã OTP 6 số bảo mật đã được gửi tới <strong>{user?.email}</strong>
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
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              {error && (
                <p className="login-error" role="alert" style={{ textAlign: "center", marginBottom: "12px" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="login-submit"
                disabled={isLoading}
                style={{ width: "100%", marginTop: "12px" }}
              >
                {isLoading ? "Đang xác thực..." : "Xác nhận mã OTP"}
              </button>

              <div className="resend-text">
                Chưa nhận được mã?{" "}
                <button
                  type="button"
                  className="resend-btn"
                  disabled={resendTimer > 0}
                  onClick={handleResendOtp}
                >
                  {resendTimer > 0 ? `Gửi lại sau ${resendTimer}s` : "Gửi lại OTP"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==================== BƯỚC 2: NHẬP MẬT KHẨU MỚI ==================== */}
        {step === "password" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1.25rem", margin: "0 0 6px" }}>Thiết lập Mật khẩu mới</h3>
              <p style={{ color: "#64748b", fontSize: "0.88rem", margin: 0 }}>
                Xác thực thành công. Vui lòng nhập mật khẩu mới cho tài khoản.
              </p>
            </div>

            <form onSubmit={handleUpdatePassword}>
              <div className="form-group">
                <label htmlFor="change-new-pwd">Mật khẩu mới</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input
                    id="change-new-pwd"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
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
                <label htmlFor="change-confirm-pwd">Xác nhận mật khẩu mới</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input
                    id="change-confirm-pwd"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
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

              {error && (
                <p className="login-error" role="alert" style={{ marginTop: "12px" }}>
                  <AlertCircle size={16} style={{ display: "inline", marginRight: "6px" }} />
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="login-submit"
                disabled={isLoading}
                style={{ width: "100%", marginTop: "20px" }}
              >
                {isLoading ? "Đang lưu..." : "Cập nhật mật khẩu"}
              </button>
            </form>
          </div>
        )}

        {/* ==================== BƯỚC 3: THÀNH CÔNG ==================== */}
        {step === "success" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <CheckCircle2 size={54} color="#22c55e" style={{ margin: "0 auto 14px" }} />
            <h3 style={{ fontSize: "1.25rem", marginBottom: "8px" }}>Đổi mật khẩu thành công!</h3>
            <p style={{ color: "#64748b", fontSize: "0.9rem", margin: 0 }}>
              Mật khẩu mới của bạn đã được cập nhật.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}