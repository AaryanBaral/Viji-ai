const https = require("https");
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function searchIndiaMART(query) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(query);
    const req = https.get({
      hostname: "dir.indiamart.com",
      path: "/search.mp?ss=" + encoded,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const matches = d.match(/https:\/\/[^"'\s]+\.(jpg|jpeg|png|webp)/g);
          const productImages = (matches || []).filter(url =>
            !url.includes("GLADMIN") && !url.includes("logo") &&
            !url.includes("banner") && !url.includes("icon") &&
            url.includes("imimg.com")
          );
          const allImages = (matches || []).filter(url => url.includes("imimg.com"));
          resolve(productImages[0] || allImages[0] || null);
        } catch (e) { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

async function run() {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, brand, product_code")
    .is("image_url", null)
    .limit(50);

  if (error) { console.error("DB error:", error); return; }
  console.log("Found " + (products?.length || 0) + " products without images");

  let success = 0, failed = 0;
  for (const p of (products || [])) {
    const brandClean = (p.brand || "").replace(/-B$/, "").replace(/-/g, " ").trim();
    const codeClean = (p.product_code || "").replace(/-Q$/, "").trim();
    const query = (brandClean + " " + codeClean + " bearing").trim();

    let url = await searchIndiaMART(query);
    if (!url) {
      const fallback = (brandClean + " " + p.name.split(" ").slice(0, 3).join(" ")).trim();
      url = await searchIndiaMART(fallback);
    }

    if (url) {
      await supabase.from("products").update({ image_url: url }).eq("id", p.id);
      console.log("✓ " + p.name);
      success++;
    } else {
      console.log("✗ " + p.name);
      failed++;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log("\nDone: " + success + " success, " + failed + " failed");
}

run().catch(console.error);
