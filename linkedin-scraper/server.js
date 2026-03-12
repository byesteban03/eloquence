const express = require('express')
const cors = require('cors')
const { chromium } = require('playwright')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => res.json({ status: 'Eloquence LinkedIn Scraper OK' }))

app.post('/search', async (req, res) => {
  const { company, titles } = req.body
  const cookie = process.env.LINKEDIN_COOKIE

  console.log('🔍 Recherche reçue pour:', company)
  console.log('Cookie présent:', !!cookie)

  if (!cookie) return res.status(401).json({ error: 'Cookie LinkedIn manquant' })

  let browser
  try {
    console.log('🚀 Lancement Chromium...')
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    })

    await context.addCookies([{
      name: 'li_at',
      value: cookie,
      domain: '.linkedin.com',
      path: '/'
    }])

    const page = await context.newPage()
    const contacts = []
    const searchTitles = titles || ['directeur communication']

    for (const title of searchTitles.slice(0, 1)) {
      const query = encodeURIComponent(`${title} ${company}`)
      const url = `https://www.linkedin.com/search/results/people/?keywords=${query}`
      console.log('📄 Navigation vers:', url)
      await page.goto(url)
      await page.waitForTimeout(4000)
      console.log('📍 URL actuelle:', page.url())

      const html = await page.content()
      console.log('HTML length:', html.length)

      const results = await page.evaluate(() => {
        const cards = document.querySelectorAll('.entity-result__item')
        console.log('Cards trouvées:', cards.length)
        return Array.from(cards).slice(0, 3).map(card => ({
          nom: card.querySelector('.entity-result__title-text a')?.innerText?.trim(),
          titre: card.querySelector('.entity-result__primary-subtitle')?.innerText?.trim(),
          linkedin_url: card.querySelector('a.app-aware-link')?.href,
        }))
      })

      console.log('Résultats bruts:', JSON.stringify(results))
      contacts.push(...results.filter(r => r.nom))
    }

    await browser.close()
    console.log('✅ Contacts trouvés:', contacts.length)
    res.json({ success: true, contacts })

  } catch (e) {
    console.error('❌ Erreur:', e.message)
    if (browser) await browser.close()
    res.status(500).json({ error: e.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Scraper LinkedIn démarré sur port ${PORT}`))
