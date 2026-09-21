import { Pool } from 'pg'

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
})

export const mdPool = new Pool({
  host: process.env.MD_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.MD_DB_PORT || process.env.DB_PORT || '5432'),
  user: process.env.MD_DB_USER || process.env.DB_USER,
  password: process.env.MD_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.MD_DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
})

export type GeoLevel = 'REGION' | 'ZONE' | 'WOREDA' | 'KEBELE' | 'region' | 'zone' | 'woreda' | 'kebele'

export async function resolveGeoValueId(level: GeoLevel, code: string): Promise<string> {
  const { rows } = await mdPool.query(
    `SELECT level_value_id FROM g2p_geo_level_values WHERE level_id = $1 AND (pcode = $2 OR level_value_mnemonic = $2) LIMIT 1`,
    ['level-' + level.toLowerCase(), code]
  )
  return rows[0]?.level_value_id ?? code
}

export async function fetchGeoOptions(level: GeoLevel, parentValueId?: string) {
  const params: string[] = ['level-' + level.toLowerCase()]
  let where = 'level_id = $1'

  if (parentValueId) {
    params.push(parentValueId)
    where += ' AND parent_level_value_id = $2'
  }

  const { rows } = await mdPool.query(
    `SELECT level_value_id AS id, level_value_id AS code, display_name AS name
       FROM g2p_geo_level_values
      WHERE ${where}
      ORDER BY display_name`,
    params
  )
  return rows
}

export async function fetchRecordStates() {
  const { rows } = await pool.query(`
    SELECT
      f.state AS code,
      f.state AS name,
      COUNT(*)::integer AS count
    FROM g2p_register_farmers f
    WHERE f.record_status = 'ACTIVE'
      AND f.state IS NOT NULL
      AND f.state NOT IN (
        'APPROVAL_STATUS_APPROVAL_LEVEL_1',
        'APPROVAL_STATUS_APPROVAL_LEVEL_2'
      )
    GROUP BY 1, 2
    ORDER BY count DESC, name
  `)
  return rows
}

export async function fetchRecordsForExport(whereClause: string, values: any[]) {
  const { rows } = await pool.query(
    `
    SELECT
      f.functional_record_id      AS record_id,
      f.internal_record_id        AS farmer_id,
      f.record_name               AS farmer_name,
      f.region_name               AS region,
      f.zone_name                 AS zone,
      f.woreda_name               AS woreda,
      f.kebele_name               AS kebele,
      f.state                     AS status,
      c.commodity                 AS commodity,
      f.land_ownership            AS ownership_type,
      c.planted_date              AS sowing_date
    FROM g2p_register_farmers f
    LEFT JOIN g2p_register_crops c
      ON c.link_internal_record_id = f.internal_record_id
     AND c.record_status = 'ACTIVE'
    WHERE f.record_status = 'ACTIVE'
      ${whereClause}
    ORDER BY f.created_at DESC, f.functional_record_id
    `,
    values
  )
  return rows
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect()
    try {
      await client.query('SELECT 1')
      return true
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Registry database connection failed:', error)
    return false
  }
}

export async function fetchFarmingTypes() {
  return [{ code: 'ALL', name: 'All' }];
}

export async function fetchGeoLevels() {
  const { rows } = await mdPool.query(
    `SELECT level_id AS code, display_name AS name FROM g2p_geo_levels ORDER BY level_id`
  )
  return rows.length ? rows : [{ code: 'REGION', name: 'Region' }];
}

let geoTotalsPromise: Promise<{region: number, zone: number, woreda: number, kebele: number}> | null = null
let lastGeoTotalsFetch = 0

export function fetchGeoTotals() {
  if (geoTotalsPromise && Date.now() - lastGeoTotalsFetch < 60000) {
    return geoTotalsPromise
  }
  
  geoTotalsPromise = (async () => {
    const { rows } = await mdPool.query(
      `SELECT level_id, COUNT(*) as c FROM g2p_geo_level_values GROUP BY level_id`
    )
    const totals = { region: 0, zone: 0, woreda: 0, kebele: 0 }
    rows.forEach((r: any) => {
      if (r.level_id === 'level-region') totals.region = parseInt(r.c)
      if (r.level_id === 'level-zone') totals.zone = parseInt(r.c)
      if (r.level_id === 'level-woreda') totals.woreda = parseInt(r.c)
      if (r.level_id === 'level-kebele') totals.kebele = parseInt(r.c)
    })
    return totals
  })()
  
  lastGeoTotalsFetch = Date.now()
  return geoTotalsPromise
}

let geoMappingsPromise: Promise<Record<string, {name: string, code: string}>> | null = null
let lastGeoMappingsFetch = 0

export function fetchGeoMappings() {
  if (geoMappingsPromise && Date.now() - lastGeoMappingsFetch < 60000) {
    return geoMappingsPromise
  }
  
  geoMappingsPromise = (async () => {
    const { rows } = await mdPool.query(
      `SELECT level_value_id, display_name, pcode FROM g2p_geo_level_values`
    )
    const map: Record<string, {name: string, code: string}> = {}
    rows.forEach((r: any) => {
      map[r.level_value_id] = { name: r.display_name, code: r.pcode }
    })
    return map
  })()
  
  lastGeoMappingsFetch = Date.now()
  return geoMappingsPromise
}
