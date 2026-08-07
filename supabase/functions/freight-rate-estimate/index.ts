const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const countryCodes: Record<string, string> = {
  Germany: 'DE', USA: 'US', Japan: 'JP', China: 'CN', Brazil: 'BR', Mexico: 'MX',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const apiKey = Deno.env.get('EASYPOST_API_KEY');
  if (!apiKey) return json({ error: 'EASYPOST_API_KEY is not configured.' }, 503);

  try {
    const body = await request.json();
    const { origin, destination, parcel, customs } = body;
    const originCountry = countryCodes[origin?.country] ?? origin?.country;
    const destinationCountry = countryCodes[destination?.country] ?? destination?.country;
    const weightKg = Number(parcel?.weightKg);
    const lengthCm = Number(parcel?.lengthCm);
    const widthCm = Number(parcel?.widthCm);
    const heightCm = Number(parcel?.heightCm);
    if (!originCountry || !destinationCountry || !origin?.city || !origin?.postalCode || !destination?.city || !destination?.postalCode || !weightKg || !lengthCm || !widthCm || !heightCm) {
      return json({ error: 'Route, dimensions and weight are required.' }, 400);
    }

    const ounces = weightKg * 35.27396195;
    const shipment = {
      shipment: {
        from_address: { city: origin.city, zip: origin.postalCode, country: originCountry },
        to_address: { city: destination.city, zip: destination.postalCode, country: destinationCountry },
        parcel: {
          weight: Number(ounces.toFixed(1)),
          length: Number((lengthCm / 2.54).toFixed(1)),
          width: Number((widthCm / 2.54).toFixed(1)),
          height: Number((heightCm / 2.54).toFixed(1)),
        },
        customs_info: {
          customs_certify: true,
          customs_signer: 'YVIMO',
          contents_type: 'merchandise',
          customs_items: [{
            description: customs?.description || 'Industrial part',
            quantity: Math.max(1, Number(customs?.quantity) || 1),
            value: Math.max(0.01, Number(customs?.value) || 0.01),
            weight: Number(ounces.toFixed(1)),
            origin_country: originCountry,
            currency: customs?.currency || 'USD',
            ...(customs?.tariffCode ? { hs_tariff_number: customs.tariffCode } : {}),
          }],
        },
      },
    };

    const response = await fetch('https://api.easypost.com/v2/shipments', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${apiKey}:`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(shipment),
    });
    const payload = await response.json();
    if (!response.ok) return json({ error: payload?.error?.message || 'EasyPost rejected the rate request.' }, response.status);
    const rates = (payload.rates ?? []).filter((rate: { rate?: string }) => Number(rate.rate) > 0);
    if (!rates.length) return json({ error: 'No eligible carrier returned a rate for this shipment.' }, 422);
    rates.sort((a: { rate: string }, b: { rate: string }) => Number(a.rate) - Number(b.rate));
    const selected = rates[0];
    const currency = String(selected.currency || 'USD').toUpperCase();
    let exchangeRate = 1;
    let exchangeRateDate = new Date().toISOString().slice(0, 10);
    if (currency !== 'MXN') {
      const fxResponse = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(currency)}&symbols=MXN`);
      if (!fxResponse.ok) return json({ error: `Unable to convert ${currency} carrier rate to MXN.` }, 502);
      const fx = await fxResponse.json();
      exchangeRate = Number(fx.rates?.MXN);
      exchangeRateDate = fx.date ?? exchangeRateDate;
      if (!exchangeRate) return json({ error: `No ${currency}/MXN exchange rate was returned.` }, 502);
    }
    const originalAmount = Number(selected.rate);
    return json({
      provider: 'EasyPost',
      carrier: selected.carrier,
      service: selected.service,
      originalAmount,
      originalCurrency: currency,
      exchangeRate,
      exchangeRateDate,
      amountMxn: Math.round(originalAmount * exchangeRate * 100) / 100,
      quotedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected freight-rate error.' }, 500);
  }
});
