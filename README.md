UAV-Based Urban Traffic Analysis & Short-Term Vehicle Count Forecasting
A web platform for managing UAV trajectory datasets, analyzing vehicle counts over time, and forecasting short-term traffic patterns.

Capstone Project: FA26SE155 · Team: GFA26SE128
FPT University Ho Chi Minh City · Fall 2026

Core technologies: FastAPI · React · Vite · PostgreSQL · PostGIS · scikit-learn · Docker
Overview
This project supports an end-to-end research workflow using selected pNEUMA vehicle trajectory datasets. It connects dataset management, quality validation, session-based aggregation, model evaluation, and forecasting in a single web application.

The forecasting target is the number of distinct vehicles observed within the selected observation area during each one-minute interval. The platform uses five lag features to forecast this count at 1, 3, and 5 minutes ahead.

Random Forest Regression is the primary model. Persistence and Historical Average provide reference baselines. Model performance is measured using MAE and RMSE under a chronological evaluation strategy.
The target represents vehicles observed within an area during a time interval. It is distinct from traffic flow measured by counting vehicles crossing a fixed road section. Reports should state this definition explicitly when using the term “traffic flow.”

Project Scope
Component	Research scope
Primary dataset	Selected pNEUMA UAV trajectory CSV files
Observation unit	An individual recording session within its observation area
Aggregation interval	1 minute
Target variable	Distinct observed vehicle count per minute
Input features	5 lagged vehicle counts from the same session
Forecast horizons	1, 3, and 5 minutes ahead
Primary model	Random Forest Regression
Baseline models	Persistence and Historical Average
Evaluation metrics	MAE and RMSE
Default split	Chronological 70% training / 30% testing


LSTM and five-minute aggregation are outside the scope described here.
Main Functional Areas
Module	Purpose
Dataset management	Upload trajectory files and organize datasets, versions, and recording sessions.
Data review and validation	Preview records and inspect missing values, duplicates, coordinates, timestamps, and negative speeds before aggregation.
Batch management	Group selected datasets for a shared aggregation and experiment workflow while preserving session identity.
Time-series aggregation	Generate one-minute distinct vehicle counts for each recording session.
Experiment management	Configure training runs and retain dataset references, model settings, split settings, and evaluation results.
Model comparison	Compare Random Forest, Persistence, and Historical Average on equivalent evaluation samples.
Forecasting	Use a selected trained configuration and recent session observations to produce forecasts for the supported horizons.
Visualization	Display time-series trends and actual-versus-predicted vehicle counts.
Access control	Provide role-based access for Administrators, Data Engineers, Data Scientists, and Business Users.


Vehicle Counting Method
Each trajectory contains a vehicle identifier and timestamped observations. A vehicle can appear in many raw records, so counting raw rows would overestimate the number of vehicles.

For each recording session and one-minute interval:
1. Select valid observations inside the configured observation area.
2. Assign observations to a minute interval using their timestamps.
3. Count distinct track_id values in that interval.
4. Store the result together with the session identifier and interval timestamp.
An interval includes its start time and excludes its end time. For example, the 08:30 interval covers 08:30:00 ≤ time < 08:31:00.
Interval	Example observed IDs	Distinct vehicle count
08:30–08:31	101, 101, 102, 103, 103	3
08:31–08:32	101, 104, 104, 105	3


Vehicle 101 contributes once to each interval in which it appears. Consequently, summing minute counts does not produce the number of unique vehicles over the entire recording.

Vehicle identifiers must be interpreted within their source session. Counts from overlapping drones must not be treated as a deduplicated citywide total without cross-camera vehicle matching.

Raw timestamps must be interpreted according to the dataset format before assigning absolute recording times. A fixed sampling interval alone does not determine the minute count.
Forecasting and Evaluation
1. Prepare session-level time series
Validate trajectory observations and aggregate one-minute counts separately for each session. Keep recording dates, timezones, and session boundaries available throughout processing.

Do not concatenate unrelated recordings into an artificial continuous timeline. A period with unavailable recording data must not automatically become a zero-vehicle interval.
2. Create lag features and targets
At forecast origin t, define the five available observations as:
lag_1 = count(t)
lag_2 = count(t - 1 minute)
lag_3 = count(t - 2 minutes)
lag_4 = count(t - 3 minutes)
lag_5 = count(t - 4 minutes)

target_h1 = count(t + 1 minute)
target_h3 = count(t + 3 minutes)
target_h5 = count(t + 5 minutes)
This notation defines lag_1 as the latest completed minute available at the forecast origin. API responses and UI labels should use the same convention.

All features and targets in a sample must belong to the same session. A sample is eligible for evaluation at a horizon only when its required observations and actual target are available.
3. Split data chronologically
Use the earlier portion of eligible data for training and the later portion for testing, with a default 70/30 ratio. Preserve complete sessions when using a session-based split, and report the resulting sample counts and achieved ratio.

Training labels must not extend into the test period. Apply this boundary rule separately for each forecast horizon. Any fitted preprocessing and Historical Average statistics must use training data only.

For rolling evaluation, a later test forecast may use observations that have become available by its own forecast origin. This protocol must be distinguished from forecasting an entire test period from one fixed origin.
4. Train models and compute baselines
Model	Prediction rule
Persistence	Reuse the latest observed vehicle count for each horizon.
Historical Average	Use an average calculated from training observations according to the experiment's documented grouping rule.
Random Forest Regression	Learn relationships between the five lag features and the future vehicle count.


Historical Average must document whether it uses a global training mean or supported time-based groups. Group statistics and fallback values must exclude test observations.
5. Evaluate and compare
Report MAE and RMSE separately for each horizon. Both metrics are expressed in vehicles; lower values indicate smaller prediction errors.

For each experiment, retain:
- Dataset version, batch, and session references.
- Aggregation interval, target definition, and lag convention.
- Forecast horizons and model hyperparameters, including the random seed.
- Split strategy, cutoff, and training/test sample counts per horizon.
- Training and prediction times.
- Predictions, actual values, and evaluation metrics.
Compare models on the same eligible test samples for each horizon. If hyperparameters or a “best” configuration are selected, use a chronological validation set or time-series cross-validation within the training portion, then reserve the test set for final evaluation.

Short recordings can produce very small test sets after lag and target construction. Report these limitations alongside the results; a low error on a few samples is insufficient evidence of generalization.
6. Generate forecasts
Keep training/evaluation and forecasting as separate workflows. For forecasting, select a trained configuration and a session with at least five consecutive valid minute observations.

Display the forecast origin, target timestamp, horizon, and predicted count. Display actual values and errors only after those actual observations are available. Predictions beyond the recording end remain forecasts without evaluation metrics.

Random Forest can return fractional estimates. Preserve the original values for metric calculation; the UI may round them for presentation when clearly labeled.
System Architecture
The platform uses a frontend/backend architecture with a layered FastAPI application.
Layer	Responsibility
React frontend	Dataset review, batch navigation, experiment comparison, and forecast visualization.
FastAPI API	Request validation, authorization, and endpoints for the research workflow.
Service layer	Data validation, aggregation, feature generation, training, and forecasting.
Database layer	Application records, dataset metadata, experiments, and results in PostgreSQL/PostGIS.
File storage	Dataset files using the storage backend configured for the environment, including S3 where enabled.


Technology Stack
Area	Technologies
Backend	Python, FastAPI, Pydantic Settings
Database access	SQLAlchemy, GeoAlchemy2, Alembic
Data processing	pandas, NumPy
Machine learning	scikit-learn
Frontend	React, Vite, Lucide React
Database	PostgreSQL with PostGIS
Local infrastructure	Docker Compose
Backend dependency management	uv
Frontend dependency management	npm


Use the versions pinned in BE/pyproject.toml, BE/uv.lock, FE/package.json, the frontend lockfile, and the relevant Compose configuration.
Project Structure
Path	Purpose
BE/app/api/v1/	API routers and endpoints
BE/app/core/	Application configuration and core infrastructure
BE/app/crud/	Database operations
BE/app/models/	Database models
BE/app/schemas/	Request and response schemas
BE/app/services/	Business logic and data processing
BE/app/main.py	FastAPI entry point
BE/pyproject.toml	Backend dependencies and project configuration
BE/uv.lock	Backend dependency lockfile
FE/src/components/	Shared UI components
FE/src/features/	Feature modules and pages
FE/src/hooks/	React hooks
FE/src/services/	API client services
FE/src/App.jsx	Frontend application root
FE/src/main.jsx	Frontend entry point
docs/	Setup guides and project documentation
docker-compose.yml	Local container configuration
dev.ps1	Windows development launcher


Local Development
Prerequisites
- Docker with Docker Compose.
- Python and Node.js versions compatible with the repository manifests.
- uv and npm.
- Environment configuration for the database, authentication, frontend API URL, and file storage.
For S3-backed local development, each developer needs their own authorized AWS credentials or profile. Pulling source code does not copy another developer's AWS configuration, database contents, or environment variables.
Start the database
From the repository root:
docker compose up -d postgres
Use the database name, credentials, and host port defined in the actual Compose and backend environment configuration. The supplied setup describes host port 5433; verify that mapping before connecting.

Initialize the application schema using the repository's migration instructions, or restore a compatible backup as described in its setup guide.
Start the backend
On Windows, use the repository helper:
.\dev.ps1
Alternatively, start the development server manually after configuring the backend environment:
uv --directory BE run uvicorn app.main:app --reload --port 8000
- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
Start the frontend
In another terminal:
cd FE
npm install
npm run dev
The default Vite development URL is http://localhost:5173. Check the terminal output for the actual port.
Deployment
Use the repository's environment-specific EC2 and S3 setup instructions. Production configuration should define the frontend API route, database connectivity, file storage, and application secrets explicitly.

Where the EC2 deployment supports IAM roles, use the instance role to authorize S3 access. Keep backend and database ports private when serving the application through a reverse proxy.

If GitHub Actions deployment is configured, document its actual trigger branch, required AWS permissions, backup procedure, and recovery behavior in the deployment guide. These details depend on the workflow files and must be verified before deployment.
Contribution Guidelines
Follow the repository's CONTRIBUTING.md and applicable AGENTS.md instructions. Confirm the team's active integration and release branches before opening a pull request.

Suggested commit messages:
feat: add session-level vehicle count aggregation
fix: prevent lag windows from crossing session boundaries
test: verify forecast target alignment
docs: clarify vehicle counting methodology
refactor: simplify experiment comparison service
chore: update dependencies
Project Team
Academic Supervisor: Mr. Ngo Dang Hai An — anndh2@fe.edu.vn
Member	Role / Contact
Nguyen Xuan Truong	Team Leader · truongnxse182688@fpt.edu.vn
Hoang Huu Nhat Huy	huyhhnse183417@fpt.edu.vn
Nguyen Duy Khang	khangndse184511@fpt.edu.vn
Le Minh Huy	huylmse182698@fpt.edu.vn


Academic Use and Dataset Attribution
This project is developed for educational and research purposes as part of the FPT University graduation capstone.

The primary dataset described in this project is pNEUMA. Cite the original dataset authors and follow the dataset's applicable access and usage terms. Dataset ownership and redistribution rights remain with the respective rights holders.

This academic-use statement does not grant a software license. Refer to the repository's LICENSE file, if provided, for software licensing terms.
