const express = require('express')
const cors = require('cors')
const { chromium } = require('playwright')

const app = express()
app.use(cors())
app.use(express.json())

// Session LinkedIn stockée en mémoire
let linkedinSession = null
let browser = null
let page = null

// Route de santé
app.get('/', (req, res) => res.json({ status: 'Eloquence LinkedIn Scraper OK' }))

// Route de connexion LinkedIn
app.post('/connect', async (req, res) => {
  try {
    const { email, password } = req.body
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    })
    page = await context.newPage()
    await page.goto('https://www.linkedin.com/login')
    await page.fill('#username', email)
    await page.fill('#password', password)
    await page.click('[type=submit]')
    await page.waitForTimeout(3000)
    const url = page.url()
    if (url.includes('feed') || url.includes('checkpoint')) {
      linkedinSession = await context.cookies()
      res.json({ success: true, url })
    } else {
      res.json({ success: false, url })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Route de recherche de contacts
app.post('/search', async (req, res) => {
  try {
    const { company, titles } = req.body
    if (!page) return res.status(401).json({ error: 'Non connecté' })

    const contacts = []
    const searchTitles = titles || ['directeur communication', 'responsable evenementiel', 'directeur marketing']

    for (const title of searchTitles.slice(0, 2)) {
      // Délai aléatoire entre requêtes pour éviter détection
      await page.waitForTimeout(2000 + Math.random() * 3000)

      const query = encodeURIComponent(`${title} ${company}`)
      await page.goto(`https://www.linkedin.com/search/results/people/?keywords=${query}&origin=GLOBAL_SEARCH_HEADER`)
      await page.waitForTimeout(2000)

      // Extrait les résultats
      const results = await page.evaluate(() => {
        const cards = document.querySelectorAll('.entity-result__item')
        return Array.from(cards).slice(0, 3).map(card => ({
          nom: card.querySelector('.entity-result__title-text')?.innerText?.trim(),
          titre: card.querySelector('.entity-result__primary-subtitle')?.innerText?.trim(),
          entreprise: card.querySelector('.entity-result__secondary-subtitle')?.innerText?.trim(),
          linkedin_url: card.querySelector('a.app-aware-link')?.href,
          photo_url: card.querySelector('img.presence-entity__image')?.src
        }))
      })

      contacts.push(...results.filter(r => r.nom && r.linkedin_url))
    }

    // Déduplique par URL
    const unique = contacts.filter((c, i, arr) => arr.findIndex(x => x.linkedin_url === c.linkedin_url) === i)
    res.json({ success: true, contacts: unique.slice(0, 3) })

  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Scraper LinkedIn démarré sur port ${PORT}`))
