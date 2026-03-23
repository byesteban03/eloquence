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

  // Validation immédiate
  if (!cookie) {
    console.error('❌ LINKEDIN_COOKIE manquant dans les variables Railway')
    return res.status(500).json({ error: 'LINKEDIN_COOKIE non configuré' })
  }
  if (!company || !titles?.length) {
    return res.status(400).json({ error: 'company et titles sont requis' })
  }

  console.log(`🔍 Recherche pour: ${company} | Titres: ${titles.join(', ')}`)

  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
    })

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'fr-FR'
    })

    await context.addCookies([{
      name: 'li_at',
      value: cookie,
      domain: '.linkedin.com',
      path: '/'
    }])

    const page = await context.newPage()
    const allContacts = []

    // ✅ Une passe par titre (au lieu de titles[0] seulement)
    for (const title of titles.slice(0, 3)) { // max 3 passes pour éviter les bans
      const query = encodeURIComponent(`${title} ${company}`)
      console.log(`  → Query: "${title} ${company}"`)

      try {
        await page.goto(`https://www.linkedin.com/search/results/people/?keywords=${query}`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        })

        // ✅ waitForSelector au lieu de waitForTimeout fixe
        await page.waitForSelector('a[href*="/in/"]', { timeout: 8000 }).catch(() => {
          console.warn(`  ⚠️ Pas de résultats pour "${title} ${company}"`)
        })

        // ✅ Vérification cookie expiré : si LinkedIn redirige vers login
        const currentUrl = page.url()
        if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
          console.error('❌ Cookie li_at expiré — LinkedIn redirige vers login')
          await browser.close()
          return res.status(401).json({ error: 'Cookie LinkedIn expiré, renouveler LINKEDIN_COOKIE dans Railway' })
        }

        const contacts = await page.evaluate(() => {
          const results = []
          const links = document.querySelectorAll('a[href*="linkedin.com/in/"]')

          links.forEach(link => {
            const name = link.querySelector('span[aria-hidden="true"]')?.innerText?.trim()
            if (!name) return
            if (results.find(r => r.linkedin_url === link.href)) return // dédup

            const li = link.closest('li')

            // ✅ Fallback en cascade pour le titre
            const titre =
              li?.querySelector('[data-anonymize="job-title"]')?.innerText?.trim() ||
              li?.querySelector('.entity-result__primary-subtitle')?.innerText?.trim() ||
              li?.querySelector('.t-14.t-black.t-normal')?.innerText?.trim() ||
              li?.querySelector('div[class*="subtitle"]')?.innerText?.trim() ||
              null

            results.push({ nom: name, linkedin_url: link.href, titre })
          })

          return results.slice(0, 3)
        })

        console.log(`  ✅ ${contacts.length} contact(s) trouvé(s)`)
        allContacts.push(...contacts)

        // Pause entre les passes pour éviter le rate limiting
        if (titles.indexOf(title) < titles.slice(0, 3).length - 1) {
          await page.waitForTimeout(1500)
        }

      } catch (passError) {
        console.warn(`  ⚠️ Erreur sur la passe "${title}":`, passError.message)
        // On continue avec le titre suivant
      }
    }

    await browser.close()

    // Déduplication finale par linkedin_url
    const unique = allContacts.filter(
      (c, i, arr) => arr.findIndex(x => x.linkedin_url === c.linkedin_url) === i
    )

    console.log(`✅ Total contacts uniques: ${unique.length}`)
    res.json({ success: true, contacts: unique })

  } catch (e) {
    console.error('❌ Erreur globale:', e.message)

    // ✅ Screenshot en cas d'erreur pour debug
    try {
      if (browser) {
        const pages = browser.contexts()?.[0]?.pages()
        if (pages?.length) {
          const screenshot = await pages[0].screenshot({ type: 'png' })
          const b64 = screenshot.toString('base64')
          console.log('📸 Screenshot (base64 partiel):', b64.substring(0, 100))
        }
      }
    } catch (_) { }

    if (browser) await browser.close()
    res.status(500).json({ error: e.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`🚀 Scraper LinkedIn démarré sur port ${PORT}`))