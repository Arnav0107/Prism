async function poll() {
  const oldBundle = 'index-BsVz0GYd.js';
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('https://prism-pink-ten.vercel.app/?t=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const html = await res.text();
      const match = html.match(/index-[A-Za-z0-9_-]+\.js/);
      const current = match ? match[0] : null;
      console.log(`Poll ${i + 1}: current bundle is ${current}`);
      if (current && current !== oldBundle) {
        console.log(`DEPLOYMENT COMPLETE! New bundle detected: ${current}`);
        return;
      }
    } catch (e) {
      console.log('Fetch error:', e.message);
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  console.log('Timeout waiting for deployment');
}
poll();
