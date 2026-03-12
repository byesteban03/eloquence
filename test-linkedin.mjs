import * as dotenv from 'dotenv'
dotenv.config()

const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/scrape-linkedin-contacts`
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

async function run() {
  console.log('Invoking', url)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({ organizationName: 'Renault France' })
    })
    
    if (!res.ok) {
      console.error('API Error:', res.status, await res.text())
      return
    }
    
    const data = await res.json()
    console.log('Result:', data)
    console.log(`Nombre de contacts retournés : ${data?.length || 0}`)
  } catch (err) {
    console.error('Fetch error:', err.message)
  }
}
run()
