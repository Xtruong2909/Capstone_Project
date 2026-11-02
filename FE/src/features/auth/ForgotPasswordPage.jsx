import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import "./LoginPage.css"; // Tái sử dụng CSS đẹp mắt của LoginPage

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // TODO: Khi Backend có API reset password, gọi qua src/services/authService
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 800);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        
        {/* Cột trái: Giữ nguyên Branding như Login */}
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
              <h3>
                Account Recovery
              </h3>
              <p>
                Don't worry, reset instructions will be sent to your registered email address.
              </p>
            </div>
          </div>
        </section>

        {/* Cột phải: Form Quên mật khẩu */}
        <section className="login-form-panel">
          {/* Nút quay lại trang Đăng nhập */}
          <button
            type="button"
            className="login-back-home"
            onClick={() => navigate("/login")}
          >
            ← Back to Sign In
          </button>

          <div className="login-form-content">
            <h2>Reset Password</h2>
            <p className="login-description">
              Enter your email address and we'll send you a recovery link.
            </p>

            {isSubmitted ? (
              // Trạng thái khi đã bấm gửi thành công
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <CheckCircle2 size={48} color="#22c55e" style={{ margin: "0 auto 12px" }} />
                <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Check your email</h3>
                <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: "20px" }}>
                  We've sent password reset instructions to <strong>{email}</strong>
                </p>
                <button
                  type="button"
                  className="login-submit"
                  onClick={() => navigate("/login")}
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              // Form nhập email
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="reset-email">Email Address</label>
                  <div className="input-wrapper">
                    <Mail size={18} />
                    <input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your registered email"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="login-submit"
                  disabled={isLoading}
                  style={{ marginTop: "16px" }}
                >
                  {isLoading ? "Sending Link..." : "Send Reset Link"}
                </button>
              </form>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}