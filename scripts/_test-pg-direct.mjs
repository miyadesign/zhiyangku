import 'dotenv/config'
import pg from 'pg'

const url = process.env.DATABASE_URL
console.log('URL host:', new URL(url).host)

const c = new pg.Client({ connectionString: url })
try {
  console.log('Connecting...')
  await c.connect()
  console.log('Connected!')
  const r = await c.query('SELECT now() as t, current_database() as db')
  console.log('Result:', r.rows[0])
  await c.end()
  console.log('Done')
} catch (e) {
  console.error('FAIL:', e.message)
  console.error('Code:', e.code)
  process.exit(1)
}
