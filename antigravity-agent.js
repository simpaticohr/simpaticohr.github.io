import 'dotenv/config'
import { createClient } from 'v0-sdk'
import readline from 'readline'
import fs from 'fs'
import path from 'path'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// Recursively find HTML, JS, and CSS files in the workspace (excluding common folders)
function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir)
  files.forEach(file => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', '.wrangler', '.vscode', 'scratch', '.agents', '.system_generated', '--prefer-online', 'Simpaticohrconsultancy', 'Simpaticohrconsultancy-', 'my-v0-app'].includes(file)) {
        getFiles(filePath, fileList)
      }
    } else {
      const ext = path.extname(file)
      if (['.html', '.js', '.css'].includes(ext) && !file.startsWith('.') && !filePath.includes('test-keys.js') && !filePath.includes('antigravity-agent.js')) {
        fileList.push(filePath)
      }
    }
  })
  return fileList
}

async function run() {
  console.log("🌀 Booting Antigravity v0 Audit Agent (Claude Fable 5)...")
  
  const v0Key = process.env.V0_API_KEY
  if (!v0Key || v0Key.includes("your_") || v0Key.trim() === '') {
    console.error("❌ V0_API_KEY is not configured in your .env file!")
    rl.close()
    return
  }

  // Initialize the Vercel v0 client
  const v0 = createClient({ apiKey: v0Key })

  // Scan and list files
  const files = getFiles(process.cwd())
  if (files.length === 0) {
    console.error("❌ No HTML, JS, or CSS files found in the workspace to audit!")
    rl.close()
    return
  }

  console.log("\n📁 Available files to audit:")
  console.log(`[0] Audit All Core Files (Bundled Site Audit)`)
  files.forEach((file, index) => {
    console.log(`[${index + 1}] ${path.relative(process.cwd(), file)}`)
  })

  rl.question(`\n🔢 Select a file to audit (1-${files.length}, 0 or 'all' for all): `, (fileIndexStr) => {
    let selectedFiles = []
    let isMultiFile = false

    const cleanInput = fileIndexStr.trim().toLowerCase()
    if (cleanInput === '0' || cleanInput === 'all') {
      isMultiFile = true
      // Select the core pages of the site for a bundled audit
      const coreFiles = ['index.html', 'about.html', 'careers.html', 'contact.html', 'js/payroll.js', 'js/assessments.js']
      selectedFiles = files.filter(f => coreFiles.includes(path.basename(f)))
      // Fallback if none of the specific files match, take first 5 files
      if (selectedFiles.length === 0) {
        selectedFiles = files.slice(0, 5)
      }
    } else {
      const fileIndex = parseInt(fileIndexStr, 10) - 1
      if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
        console.error("❌ Invalid selection!")
        rl.close()
        return
      }
      selectedFiles = [files[fileIndex]]
    }

    rl.question('💬 Enter any specific instructions or focus areas (optional): ', async (customInstructions) => {
      let prompt = ''
      let relativeNames = selectedFiles.map(f => path.relative(process.cwd(), f)).join(', ')

      if (isMultiFile) {
        console.log(`\n🚀 Bundling and sending core site files (${relativeNames}) to Claude Fable 5 on v0.dev...`)
        
        prompt = `You are a senior software engineer, UI designer, and security auditor.
Please perform a complete, site-wide code audit and debugging of the following files: ${relativeNames}.

Focus areas:
1. Multi-page consistency, navigation links, and cross-file routing errors.
2. Global SEO, meta description structure, and duplicate geo-targeting tags.
3. Core layout, UI responsiveness, and shared design system inconsistencies.
4. Security vulnerabilities (RLS logic, session storage safety, validation flaws).

${customInstructions ? `Custom User Instructions:\n"${customInstructions}"\n` : ''}

Here are the contents of the files:
`
        selectedFiles.forEach(file => {
          const content = fs.readFileSync(file, 'utf-8')
          prompt += `\n\n=========================================\n`
          prompt += `📄 File: ${path.relative(process.cwd(), file)}\n`
          prompt += `=========================================\n\`\`\`\n`
          prompt += content
          prompt += `\n\`\`\`\n`
        })

        prompt += `\nReturn a comprehensive site-wide HTML/SEO audit report in markdown detailing the findings, architectural recommendations, and step-by-step code blocks for improvements.`

      } else {
        const selectedFile = selectedFiles[0]
        const relativePath = path.relative(process.cwd(), selectedFile)
        const fileContent = fs.readFileSync(selectedFile, 'utf-8')
        
        console.log(`\n🚀 Sending ${relativePath} to Claude Fable 5 on v0.dev for auditing...`)

        prompt = `You are a senior software engineer, UI designer, and security auditor.
Please perform a complete code audit and debugging of the following file: ${path.basename(selectedFile)}.

Focus areas:
1. Logical bugs, runtime errors, and security vulnerabilities (e.g. RLS leaks, injection, input validation).
2. UI styling, layout responsiveness, and user experience.
3. SEO, schema data, accessibility (a11y), and semantic HTML.
4. Performance bottlenecks, code organization, and cleanup.

${customInstructions ? `Custom User Instructions:\n"${customInstructions}"\n` : ''}

Here is the file content:
\`\`\`
${fileContent}
\`\`\`

Return a structured markdown audit report containing:
- Executive Summary of findings (labeled with critical, warning, or good)
- Detailed breakdown of issues with root causes
- Step-by-step suggestions or updated code blocks to resolve them.`
      }

      try {
        const chat = await v0.chats.create({ message: prompt })
        console.log("\n✅ Audit Chat initiated successfully!")
        console.log(`🌐 Watch real-time generation on v0: ${chat.webUrl}`)
        console.log("⏳ Fetching and compiling results from Claude Fable 5...")

        let completed = false
        let retries = 0
        let lastContentLength = 0
        let reportText = ''

        // Poll chat status until generation finishes
        while (!completed && retries < 30) {
          // Wait 5 seconds between checks
          await new Promise(resolve => setTimeout(resolve, 5000))
          
          try {
            const chatData = await v0.chats.getById(chat.id)
            const assistantMessage = chatData.messages?.findLast(m => m.role === 'assistant')
            
            if (assistantMessage && assistantMessage.content) {
              const content = assistantMessage.content
              
              if (content.length > 0 && content.length === lastContentLength) {
                // Content length has stabilized, generation is finished
                completed = true
                reportText = content
              } else {
                lastContentLength = content.length
                console.log(`⏳ Claude is writing... (${Math.round(content.length / 1024)} KB received)`)
              }
            } else {
              console.log("⏳ Waiting for Claude to begin response...")
            }
          } catch (pollErr) {
            console.error(`⚠️ Polling status check error: ${pollErr.message}`)
          }
          retries++
        }

        if (completed && reportText) {
          const reportFileName = isMultiFile ? `audit-sitewide.md` : `audit-${path.basename(selectedFiles[0])}.md`
          fs.writeFileSync(reportFileName, reportText)
          console.log(`\n✅ Audit complete! Saved detailed report to: [${reportFileName}](file:///${path.join(process.cwd(), reportFileName).replace(/\\/g, '/')})`)
        } else {
          console.log(`\n⚠️ Polling timed out. You can read the complete audit report directly on the web at: ${chat.webUrl}`)
        }

      } catch (err) {
        console.error(`\n❌ Error creating audit chat: ${err.message}`)
      }

      rl.close()
    })
  })
}

run()





