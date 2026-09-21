export interface ChartFilters {
  region?: string
  zone?: string
  woreda?: string
  kebele?: string
  recordState?: string
}

export const DYNAMIC_FILTERS = '--- DYNAMIC_FILTERS ---'

export const SCOPE = `
  WITH scope AS (
    SELECT
      f.internal_record_id,
      f.internal_record_id AS farmer_uuid,
      (SELECT elem->>'level_value_id' FROM jsonb_array_elements(f.geo_code_hierarchy_json->'hierarchy') elem WHERE elem->>'level_mnemonic' = 'region' LIMIT 1) AS region,
      (SELECT elem->>'level_value_id' FROM jsonb_array_elements(f.geo_code_hierarchy_json->'hierarchy') elem WHERE elem->>'level_mnemonic' = 'zone' LIMIT 1) AS zone,
      (SELECT elem->>'level_value_id' FROM jsonb_array_elements(f.geo_code_hierarchy_json->'hierarchy') elem WHERE elem->>'level_mnemonic' = 'woreda' LIMIT 1) AS woreda,
      (SELECT elem->>'level_value_id' FROM jsonb_array_elements(f.geo_code_hierarchy_json->'hierarchy') elem WHERE elem->>'level_mnemonic' = 'kebele' LIMIT 1) AS kebele,
      f.state,
      f.gender,
      f.education_level,
      f.is_psnp_user,
      f.import_source,
      f.land_ownership,
      f.created_at::date AS recorded_on,
      f.is_household_head,
      f.total_land_area,
      f.foundational_id,
      CASE 
        WHEN f.estimated_age < 18 THEN '0-18'
        WHEN f.estimated_age BETWEEN 18 AND 29 THEN '18-30'
        WHEN f.estimated_age BETWEEN 30 AND 49 THEN '30-50'
        WHEN f.estimated_age BETWEEN 50 AND 69 THEN '50-70'
        WHEN f.estimated_age >= 70 THEN '70+'
        ELSE 'Unknown'
      END AS age_group
    FROM g2p_register_farmers f
    WHERE f.record_status = 'ACTIVE'
      ${DYNAMIC_FILTERS.replace('cs.', 'f.')}
  )
`

function farmersByLevel(level: 'region' | 'zone' | 'woreda' | 'kebele'): string {
  return `
    ${SCOPE}
    SELECT
      s.${level} AS ${level}_id,
      COUNT(DISTINCT s.farmer_uuid)::integer AS farmers
    FROM scope s
    GROUP BY 1
    ORDER BY farmers DESC
  `
}

export const CHART_QUERIES = {
  farmerKpis: `
    ${SCOPE}
    SELECT
      COUNT(DISTINCT s.farmer_uuid)::integer AS total_farmers,
      COUNT(DISTINCT CASE WHEN s.gender = 'FEMALE' THEN s.farmer_uuid END)::integer AS female_farmers,
      COUNT(DISTINCT CASE WHEN s.gender = 'MALE' THEN s.farmer_uuid END)::integer AS male_farmers,
      COUNT(DISTINCT CASE WHEN s.is_household_head = true THEN s.farmer_uuid END)::integer AS household_heads,
      COALESCE(SUM(s.total_land_area), 0) AS total_land_size,
      COALESCE(AVG(s.total_land_area), 0) AS avg_farm_size,
      COUNT(DISTINCT CASE WHEN s.land_ownership = 'OWNER' THEN s.farmer_uuid END)::integer AS farmers_with_owned_land,
      COUNT(DISTINCT CASE WHEN s.foundational_id IS NOT NULL THEN s.farmer_uuid END)::integer AS farmers_with_id,
      COUNT(DISTINCT s.woreda)::integer AS woredas_reporting
    FROM scope s
  `,

  farmersByFarmerId: `
    ${SCOPE}
    SELECT
      'farmer_id' AS category,
      COUNT(DISTINCT CASE WHEN s.foundational_id IS NOT NULL THEN s.farmer_uuid END)::integer AS farmers
    FROM scope s
  `,

  farmersByRecordState: `
    ${SCOPE}
    SELECT
      CASE 
        WHEN s.state = 'APPROVED' THEN 'active'
        WHEN s.state = 'REJECTED' THEN 'rejected'
        ELSE COALESCE(s.state, 'open')
      END AS record_state,
      COUNT(DISTINCT s.farmer_uuid)::integer AS farmers
    FROM scope s
    GROUP BY 1
  `,

  farmersByRegion: farmersByLevel('region'),
  farmersByZone: farmersByLevel('zone'),
  farmersByWoreda: farmersByLevel('woreda'),
  farmersByKebele: farmersByLevel('kebele'),

  farmersByType: `
    ${SCOPE}
    SELECT
      COALESCE(s.land_ownership, 'Unknown') AS farming_type,
      COUNT(DISTINCT s.farmer_uuid)::integer AS farmers
    FROM scope s
    GROUP BY 1
    ORDER BY farmers DESC
  `,

  farmersByAgeAndGender: `
    ${SCOPE}
    SELECT
      s.age_group,
      COALESCE(s.gender, 'Unknown') AS gender,
      COUNT(DISTINCT s.farmer_uuid)::integer AS farmers
    FROM scope s
    GROUP BY 1, 2
    ORDER BY farmers DESC
  `,

  farmersByEducation: `
    ${SCOPE}
    SELECT
      COALESCE(s.education_level, 'Unknown') AS education,
      COUNT(DISTINCT s.farmer_uuid)::integer AS farmers
    FROM scope s
    GROUP BY 1
    ORDER BY farmers DESC
  `,

  farmersBySupportStatus: `
    ${SCOPE}
    SELECT
      CASE WHEN s.is_psnp_user THEN 'PSNP' ELSE 'Non-PSNP' END AS support_status,
      COUNT(DISTINCT s.farmer_uuid)::integer AS farmers
    FROM scope s
    GROUP BY 1
    ORDER BY farmers DESC
  `,

  farmersByImportStatus: `
    ${SCOPE}
    SELECT
      COALESCE(s.import_source, 'Manual') AS import_status,
      COUNT(DISTINCT s.farmer_uuid)::integer AS farmers
    FROM scope s
    GROUP BY 1
    ORDER BY farmers DESC
  `,

  landTenureSplit: `
    ${SCOPE}
    SELECT
      COALESCE(s.land_ownership, 'Unknown') AS ownership_type,
      COUNT(DISTINCT s.farmer_uuid)::integer AS parcels,
      COALESCE(SUM(s.total_land_area), 0) AS area
    FROM scope s
    GROUP BY 1
    ORDER BY parcels DESC
  `,

  registryTrendByMonth: `
    ${SCOPE}
    SELECT
      TO_CHAR(DATE_TRUNC('month', s.recorded_on), 'YYYY-MM') AS period,
      COUNT(DISTINCT s.farmer_uuid)::integer AS farmers
    FROM scope s
    WHERE s.recorded_on IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `,
  
  registryCoverage: `
    ${SCOPE}
    SELECT
      COUNT(DISTINCT s.farmer_uuid)::integer AS farmers
    FROM scope s
  `
} as const

export type ChartName = keyof typeof CHART_QUERIES
