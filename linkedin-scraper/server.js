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

  console.log('🔍 Recherche pour:', company)

  let browser
  try {
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
    const query = encodeURIComponent(`${titles[0]} ${company}`)
    await page.goto(`https://www.linkedin.com/search/results/people/?keywords=${query}`)
    await page.waitForTimeout(4000)

    // Dump tous les sélecteurs disponibles pour debug
    const debug = await page.evaluate(() => {
      const allLinks = document.querySelectorAll('a[href*="/in/"]')
      const allSpans = document.querySelectorAll('span[aria-hidden="true"]')
      return {
        links: Array.from(allLinks).slice(0, 5).map(a => ({
          href: a.href,
          text: a.innerText?.trim()
        })),
        spans: Array.from(allSpans).slice(0, 10).map(s => s.innerText?.trim()),
        bodyClasses: document.body.className
      }
    })

    console.log('Links trouvés:', JSON.stringify(debug.links))
    console.log('Spans:', JSON.stringify(debug.spans))

    // Extraction avec nouveaux sélecteurs
    const contacts = await page.evaluate(() => {
      const results = []
      const links = document.querySelectorAll('a[href*="linkedin.com/in/"]')
      links.forEach(link => {
        const name = link.querySelector('span[aria-hidden="true"]')?.innerText?.trim()
        if (name && !results.find(r => r.linkedin_url === link.href)) {
          results.push({
            nom: name,
            linkedin_url: link.href,
            titre: link.closest('li')?.querySelector('.entity-result__primary-subtitle, [data-anonymize="job-title"]')?.innerText?.trim()
          })
        }
      })
      return results.slice(0, 3)
    })

    console.log('Contacts extraits:', JSON.stringify(contacts))
    await browser.close()
    res.json({ success: true, contacts })

  } catch (e) {
    console.error('❌ Erreur:', e.message)
    if (browser) await browser.close()
    res.status(500).json({ error: e.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Scraper LinkedIn démarré sur port ${PORT}`))
