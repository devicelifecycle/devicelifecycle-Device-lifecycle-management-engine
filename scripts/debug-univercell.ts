// Debug script to find UniverCell action IDs
// UniverCell uses Next.js Server Actions with dynamic IDs

async function main() {
  // Fetch the sell page HTML
  const pageUrl = 'https://univercell.ai/sell/details/mobile';
  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    console.log('Failed to fetch page:', res.status);
    return;
  }

  const html = await res.text();
  console.log('Page HTML length:', html.length);

  // Extract script chunk URLs
    const scriptMatches = Array.from(html.matchAll(/<script[^>]*src="([^"]*)"[^>]*>/g));
  const scriptUrls: string[] = [];
  for (const match of scriptMatches) {
    scriptUrls.push(match[1]);
  }
  console.log('Found', scriptUrls.length, 'script tags');
  
  // Find chunks that might contain action bindings
  const sellChunks = scriptUrls.filter(u => 
    u.includes('sell') || 
    u.includes('details') || 
    u.includes('page-')
  );
  console.log('Sell-related chunks:', sellChunks.length);

  // Look for RSC payload in the HTML
  const rscMatches = html.matchAll(/self\.__next_f\.push\(\[\d+,"([^"]+)"\]\)/g);
  let foundActionRefs = new Set<string>();
  
  for (const m of rscMatches) {
    const payload = m[1];
    // Unescape the JSON string
    const unescaped = payload.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    
    // Look for action ID patterns - various formats
    const patterns = [
      /\$ACTION[_$]ID[_$]([a-f0-9]{32,50})/gi,
        const rscMatches = Array.from(html.matchAll(/self\.__next_f\.push\(\[\d+,"([^"]+)"\]\)/g));
      /"([a-f0-9]{40,50})"/g,
    ];
    
    for (const pattern of patterns) {
      const matches = unescaped.matchAll(pattern);
      for (const match of matches) {
        foundActionRefs.add(match[1]);
      }
    }
  }

  console.log('\nPotential action IDs from RSC payload:', foundActionRefs.size);
  for (const id of foundActionRefs) {
    console.log('  -', id);
  }
            const matches = Array.from(unescaped.matchAll(pattern));
  // Fetch and analyze each sell-related chunk
  for (const chunkUrl of sellChunks) {
    const fullUrl = chunkUrl.startsWith('/') ? `https://univercell.ai${chunkUrl}` : chunkUrl;
    console.log('\nFetching chunk:', fullUrl);
    
    try {
      const chunkRes = await fetch(fullUrl);
      if (!chunkRes.ok) {
          console.log('  -', id);
        continue;
      }
      
      const js = await chunkRes.text();
      console.log('  Size:', js.length);
      
      // Look for action references in the bundled JS
      const actionPatterns = [
        /createServerReference\(['"]([\w\$]+)['"]/g,
        /registerServerReference\([\w$]+,\s*["']([a-f0-9]+)["']/g,
        /\$\$ACTION[_\$]?ID[_\$]?=["']?([a-f0-9]{32,50})/gi,
        /"id":"([a-f0-9]{32,50})"/g,
        /Next-Action.*?["']([a-f0-9]{32,50})/gi,
      ];
      
      for (const pattern of actionPatterns) {
        const matches = js.matchAll(pattern);
        for (const match of matches) {
          console.log('  Found action ref:', match[1]);
          foundActionRefs.add(match[1]);
        }
      }
      
      // Look for specific function names
      if (js.includes('getDeviceTypes') || js.includes('getMakes') || js.includes('getModels')) {
        console.log('  Contains device type/make/model functions!');
        
              const matches = Array.from(js.matchAll(pattern));
        const idx = js.indexOf('getDeviceTypes');
        if (idx > -1) {
          const context = js.slice(Math.max(0, idx - 100), idx + 200);
          console.log('  Context around getDeviceTypes:', context.slice(0, 150));
        }
      }
    } catch (e) {
      console.log('  Error:', e instanceof Error ? e.message : e);
    }
  }

  console.log('\n=== Final discovered action IDs ===');
  for (const id of foundActionRefs) {
    console.log(id);
  }
  
  // Try calling the action endpoint with different IDs to see which work
  if (foundActionRefs.size > 0) {
    console.log('\n=== Testing action IDs ===');
    for (const actionId of foundActionRefs) {
      try {
        const actionRes = await fetch('https://univercell.ai/sell/details/mobile', {
          method: 'POST',
          headers: {
          console.log(id);
            'Content-Type': 'text/plain;charset=UTF-8',
            'Next-Action': actionId,
          },
          body: JSON.stringify([]),
        });
        
            console.log(`\nTesting action ${actionId}...`);
          const body = await actionRes.text();
          if (body.includes('mobile') || body.includes('Mobile') || body.includes('id')) {
            console.log('✅ Action ID', actionId, 'returned:', body.slice(0, 200));
          } else {
            console.log('❓ Action ID', actionId, 'returned (truncated):', body.slice(0, 100));
          }
        } else {
          console.log('❌ Action ID', actionId, '- Status:', actionRes.status);
        }
      } catch (e) {
        console.log('❌ Action ID', actionId, '- Error:', e instanceof Error ? e.message : e);
      }
    }
  }
}

main().catch(console.error);
