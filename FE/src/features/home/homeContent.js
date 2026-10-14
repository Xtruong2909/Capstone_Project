import {
  Database,
  BarChart3,
  Clock,
  TrendingUp,
  CheckCircle2,
  LayoutDashboard,
  Car,
  AlertTriangle,
} from 'lucide-react'

export const NAV_LINKS = [
  { label: 'Overview', href: '#overview' },
  { label: 'Features', href: '#features' },
  { label: 'Pipeline', href: '#workflow' },
  { label: 'ML Models', href: '#models' },
  { label: 'Datasets', href: '#datasets' },
]

// 6 core groups & advanced modules from De_tai_Phan_tich_giao_thong_UAV.docx (Trajectory data only)
export const FEATURES = [
  {
    icon: Database,
    color: 'blue',
    tag: 'Group 01',
    title: 'UAV Trajectory Ingestion & Storage',
    desc: 'Ingest, validate, and store high-resolution drone trajectory files (CSV format) containing vehicle coordinates, speeds, and timestamps.',
  },
  {
    icon: BarChart3,
    color: 'purple',
    tag: 'Group 02',
    title: 'Traffic Pattern Analysis',
    desc: 'Compute real-time flow rate (veh/min), average velocities (km/h), and estimated spatial vehicle density across observed street corridors.',
  },
  {
    icon: Clock,
    color: 'blue',
    tag: 'Group 03',
    title: '1-Min & 5-Min Temporal Aggregation',
    desc: 'Resample raw microscopic trajectory records into regular 1-minute and 5-minute time-series buckets for statistical modeling.',
  },
  {
    icon: TrendingUp,
    color: 'orange',
    tag: 'Group 04',
    title: 'Short-Term Flow Forecasting (1–5 Min)',
    desc: 'Predict upcoming traffic flow across 1, 3, and 5-minute horizons, capturing short-term volume surges before bottlenecks form.',
  },
  {
    icon: CheckCircle2,
    color: 'green',
    tag: 'Group 05',
    title: 'Model Evaluation & Benchmarking',
    desc: 'Strict chronological time-based train/test splits to eliminate lookahead data leakage, evaluated quantitatively via MAE and RMSE.',
  },
  {
    icon: LayoutDashboard,
    color: 'blue',
    tag: 'Group 06',
    title: 'Interactive Analytics Dashboard',
    desc: 'Interactive comparison between actual observed flow and multi-model predictions, trend charts, error metrics, and operational insights.',
  },
  {
    icon: Car,
    color: 'purple',
    tag: 'Advanced',
    title: 'Vehicle Type Classification',
    desc: 'Differentiate flow composition across motorcycles, passenger cars, taxis, and buses based on trajectory tracking properties.',
  },
  {
    icon: AlertTriangle,
    color: 'orange',
    tag: 'Advanced',
    title: 'Congestion Risk Early Warning',
    desc: 'Identify sudden density surges and deceleration clusters in real time to signal impending local traffic congestion risks.',
  },
]

// 6-step proposed data pipeline from De_tai_Phan_tich_giao_thong_UAV.docx
export const WORKFLOW = [
  {
    step: '01',
    title: 'UAV Trajectory Ingestion',
    desc: 'Import drone vehicle trajectory datasets formatted in the pNEUMA standard CSV schema.',
  },
  {
    step: '02',
    title: 'Preprocessing & Cleaning',
    desc: 'Filter missing values, validate timestamps, and extract per-vehicle velocities and coordinates.',
  },
  {
    step: '03',
    title: 'Temporal Aggregation',
    desc: 'Resample continuous tracking points into 1-minute and 5-minute traffic flow time-series.',
  },
  {
    step: '04',
    title: 'Machine Learning Training',
    desc: 'Train Historical Average baseline, Random Forest Regression, and optional LSTM sequence models.',
  },
  {
    step: '05',
    title: 'Chronological Evaluation',
    desc: 'Benchmark model error across 1, 3, and 5-min forecasting horizons using MAE and RMSE metrics.',
  },
  {
    step: '06',
    title: 'Dashboard & Visualization',
    desc: 'Explore real-time observed vs. predicted traffic flows and operational flow trends.',
  },
]

// Models specified in Section 4 of De_tai_Phan_tich_giao_thong_UAV.docx
export const MODELS = [
  {
    id: 'baseline',
    name: 'Historical Average / Persistence',
    role: 'Baseline Benchmark',
    complexity: 'Low',
    complexityColor: 'green',
    desc: 'Uses recent historical rolling averages as a naive reference point to establish baseline error bounds.',
    inputs: 'Past rolling window averages (t-1, t-2)',
  },
  {
    id: 'rf',
    name: 'Random Forest Regression',
    role: 'Primary Machine Learning Model',
    complexity: 'Medium',
    complexityColor: 'blue',
    desc: 'Ensemble of decision trees modeling non-linear interactions across past 5-minute lag traffic flows, velocity, and temporal trends.',
    inputs: 'Flow of past 5 minutes (t-1 to t-5), average speed, active vehicles, time trend',
  },
  {
    id: 'lstm',
    name: 'LSTM (Long Short-Term Memory)',
    role: 'Deep Learning Sequence Model (Extension)',
    complexity: 'Medium – High',
    complexityColor: 'purple',
    desc: 'Recurrent neural architecture capturing sequential dependencies when UAV observation sessions offer sufficient length.',
    inputs: 'Sequential multivariate window vectors with sliding temporal horizons',
  },
]

// Research trajectory datasets from Section 3 (No video processing)
export const DATASETS = [
  {
    name: 'pNEUMA Dataset (EPFL)',
    tag: 'Primary Benchmark',
    status: 'Recommended',
    desc: 'Large-scale urban traffic trajectory dataset recorded by UAV swarms over downtown Athens, Greece. Contains vehicle ID, vehicle type, coordinates, speeds, and timestamps.',
    source: 'EPFL Open-Traffic Research Laboratory',
    link: 'https://open-traffic.epfl.ch/index.php/downloads/',
  },
  {
    name: 'Custom UAV Trajectory CSV',
    tag: 'User Ingestion',
    status: 'Supported',
    desc: 'Upload pre-processed drone trajectory CSV recordings with spatial coordinates, bounding box metadata, and velocities for custom intersection analytics.',
    source: 'Local Drone Survey / User Upload',
  },
  {
    name: 'Standardized Trajectory Sessions',
    tag: 'Multi-Corridor Data',
    status: 'Ready for ML',
    desc: 'Pre-cleaned, normalized trajectory sessions ready for time-series extraction, lag feature engineering, and model training.',
    source: 'Standardized Data Repository',
  },
]
