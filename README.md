# Farmer Registry Dashboard UI

A standalone, production-ready analytics dashboard for the Farmer Registry. Built with Next.js, this application directly queries the registry and master data databases to render insights into coverage, demographics, land tenure, and registration trends, filtered by geography, farming type, and record state.

## Features

- **Direct Database Integration:** Connects directly to PostgreSQL databases (both the primary registry and master data) using read-only SQL queries.
- **Topological Maps:** Renders geographical boundaries dynamically based on region, zone, or woreda. Maps are aggressively cached to ensure high concurrency without blocking the server.
- **CSV Data Exports:** Built-in endpoints allow exporting the raw data behind any chart as standard CSV.

## Prerequisites

- Node.js 24+ (for local development)
- Docker and Docker Compose (for production deployments)
- PostgreSQL instances containing the `farmer_registry_db` and `farmer_master_data_db` schemas.

## Environment Variables

The dashboard requires connection strings to both the main registry database and the master data database.

Copy the `.env.example` file to `.env.local` for development, or set these in your deployment environment:

```env
# Primary Registry Database (farmers, lands, households, approvals)
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=farmer_registry_db

# Master Data Database (geo catalogues, region hierarchies)
MD_DB_HOST=postgres
MD_DB_PORT=5432
MD_DB_USER=postgres
MD_DB_PASSWORD=postgres
MD_DB_NAME=farmer_master_data_db

# URL to return to when clicking "Back" in the dashboard header
NEXT_PUBLIC_PORTAL_URL=http://localhost:3001
```

## Running Locally for Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000` in your browser.

## Building and Running with Docker (Production)

This repository includes a standalone `Dockerfile` and `docker-compose.yml` to run the dashboard as a self-contained service.

1. Build and start the container:
   ```bash
   docker compose up --build -d
   ```

2. The dashboard will be available at `http://localhost:3002` (configurable via the `PORT` environment variable).

## Maps Configuration

The map panel uses Ethiopian boundaries by default, matched on P-code. The TopoJSON boundary files are located in `public/maps/`.

To adapt the map for a different country:
1. Replace `regions.topojson.br`, `zones.topojson.br`, and `woredas.topojson.br` with your own boundaries.
2. Ensure the boundary properties use `admin1Pcod`, `admin2Pcod`, and `admin3Pcod` to match the Master Data `level_value_id` records in the database.
3. The server natively decompresses and caches the `.br` (Brotli) files in memory upon the first request.

## Architecture Notes

- **Read-Only Access:** The dashboard only performs `SELECT` queries. It relies on the Staff/Partner APIs to perform writes.
- **SQL Execution:** Queries are assembled in `lib/chart-queries.ts` using a Common Table Expression (CTE) called `SCOPE` which resolves filters once.
- **Standalone Mode:** The dashboard was originally part of a monolithic stack, but operates completely independent of the Staff Portal's Next.js image. The `NEXT_PUBLIC_PORTAL_URL` is baked into the client bundle at build time to provide a seamless "Back" button experience for users entering from the portal.
