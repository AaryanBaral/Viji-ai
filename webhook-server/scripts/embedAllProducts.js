const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const NIM_API_KEY = process.env.NVIDIA_API_KEY;
const NIM_MODEL = 'nvidia/nv-embedqa-e5-v5';
const BATCH_SIZE = 50;  // NIM handles up to 96 inputs; keep low to avoid timeouts
const PAGE_SIZE = 1000;  // fetch 1000 at a time

async function embedBatch(products) {
    const texts = products.map(p =>
        `${p.name} ${p.vehicle_model || ''} ${p.vehicle_make || ''} ${p.brand || ''} ${p.product_code} ${p.category || ''}`.trim()
    );
    const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${NIM_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: NIM_MODEL, input: texts, input_type: 'passage' })
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`NIM error: ${response.status} — ${err}`);
    }
    const data = await response.json();
    return data.data.map(d => d.embedding);
}

async function run() {
    let totalSuccess = 0;
    let totalFailed = 0;
    let page = 0;

    console.log('Starting NVIDIA NIM re-embedding → embedding_nim (1024-dim)');

    while (true) {
        const { data: products, error } = await supabase
            .from('products')
            .select('id, name, brand, product_code, category, vehicle_model, vehicle_make')
            .is('embedding_nim', null)
            .range(0, PAGE_SIZE - 1);

        if (error) { console.error('Fetch error:', error.message); break; }
        if (!products || products.length === 0) { console.log('All done!'); break; }

        console.log(`Page ${page + 1}: processing ${products.length} products...`);

        for (let i = 0; i < products.length; i += BATCH_SIZE) {
            const batch = products.slice(i, i + BATCH_SIZE);
            try {
                const embeddings = await embedBatch(batch);
                for (let j = 0; j < batch.length; j++) {
                    const { error: updateError } = await supabase
                        .from('products')
                        .update({ embedding_nim: embeddings[j] })
                        .eq('id', batch[j].id);
                    if (updateError) throw new Error(updateError.message);
                }
                totalSuccess += batch.length;
                process.stdout.write(`\r  ✅ ${totalSuccess} done, ❌ ${totalFailed} failed`);
            } catch (err) {
                totalFailed += batch.length;
                console.error(`\n❌ batch error at i=${i}: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        console.log(`\nPage ${page + 1} complete. Total: ✅ ${totalSuccess} | ❌ ${totalFailed}`);
        page++;
    }

    console.log(`\nDone! ✅ ${totalSuccess} succeeded, ❌ ${totalFailed} failed`);
}
run();
