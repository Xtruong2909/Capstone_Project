import {
  Users, Database, ShieldCheck, CheckCircle2, BarChart3, LineChart, TrendingUp,
  FlaskConical, FileText, ScrollText, Sparkles, Map,
} from 'lucide-react'

export const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Datasets', href: '#datasets' },
]

// Modules FE-01 to FE-13 (Role.docx)
export const FEATURES = [
  { icon: Users, color: 'blue', title: 'User, Role & Permission Management', desc: 'Authentication, role assignment, and dataset-level access control with grant / revoke.' },
  { icon: Database, color: 'blue', title: 'Traffic Dataset Management', desc: 'Upload SinD, pNEUMA, or your own data. Preview, version, archive, and store processed datasets.' },
  { icon: ShieldCheck, color: 'green', title: 'Data Validation & Preprocessing', desc: 'Detect missing values, duplicates, and invalid timestamps or coordinates, then clean and normalize.' },
  { icon: CheckCircle2, color: 'green', title: 'Dataset Approval & Access', desc: 'Administrators approve or reject datasets and share approved versions with analysts.' },
  { icon: BarChart3, color: 'purple', title: 'Traffic Pattern Analysis', desc: 'Vehicle count, speed, density, flow, peak periods, and congestion hotspot detection.' },
  { icon: Map, color: 'purple', title: 'Traffic Visualization', desc: 'Interactive charts, 1 / 5 / 15-minute time series, historical trends, and traffic heatmaps.' },
  { icon: TrendingUp, color: 'orange', title: 'Short-Term Forecasting', desc: 'ARIMA and Prophet with configurable parameters and 15, 30, or 60-minute horizons.' },
  { icon: LineChart, color: 'orange', title: 'Evaluation & Model Comparison', desc: 'MAE, RMSE, MAPE, and R² with actual vs. predicted comparison, benchmarked on pNEUMA.' },
  { icon: FlaskConical, color: 'blue', title: 'Experiment Management', desc: 'Configure, run, copy, and compare experiments with full reproducibility support.' },
  { icon: BarChart3, color: 'blue', title: 'Traffic Analytics Dashboard', desc: 'One place for statistics, trends, hotspots, forecasts, and experiment comparisons.' },
  { icon: FileText, color: 'green', title: 'Reporting & Export', desc: 'Generate analysis and forecasting reports with charts and export to PDF or Excel.' },
  { icon: ScrollText, color: 'purple', title: 'Audit Trail', desc: 'Every upload, approval, permission change, experiment, and report is logged.' },
  { icon: Sparkles, color: 'orange', title: 'AI-Assisted Analytics', desc: 'Summaries, anomaly detection, congestion risk insights, and natural-language Q&A.' },
]

export const WORKFLOW = [
  { step: '01', title: 'Upload', desc: 'Ingest traffic datasets with metadata.' },
  { step: '02', title: 'Validate', desc: 'Check quality, clean, and version data.' },
  { step: '03', title: 'Approve', desc: 'Admin reviews and grants access.' },
  { step: '04', title: 'Analyze', desc: 'Explore density, flow, and hotspots.' },
  { step: '05', title: 'Forecast', desc: 'Run ARIMA and Prophet experiments.' },
  { step: '06', title: 'Report', desc: 'Evaluate, compare, and export results.' },
]

export const DATASETS = [
  { name: 'SinD', tag: 'Signalized Intersection', desc: 'Drone-captured trajectories at signalized intersections. Used for pattern analysis and forecasting.', status: 'Approved' },
  { name: 'pNEUMA', tag: 'Benchmark Dataset', desc: 'Large-scale urban drone dataset used as the benchmark for model evaluation.', status: 'Benchmark' },
  { name: 'User-provided', tag: 'Custom Upload', desc: 'Upload your own traffic data, validate it, and put it through the approval workflow.', status: 'Pending' },
]

