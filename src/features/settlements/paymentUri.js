// Use only the server-provided URI, after checking its scheme and transaction amount.
export function validPaymentUri(payment, amount) {
  if (!payment?.qr_available || typeof payment.upi_uri !== 'string') return null;
  try {
    const uri = new URL(payment.upi_uri);
    const params = uri.searchParams;
    if (uri.protocol !== 'upi:' || uri.hostname !== 'pay' || uri.username || uri.password || uri.port || uri.hash || (uri.pathname && uri.pathname !== '/')) return null;
    for (const key of ['pa', 'am', 'cu']) if (params.getAll(key).length !== 1) return null;
    if (!/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,35}$/.test(params.get('pa') ?? '')) return null;
    if (params.get('am') !== amount || params.get('cu') !== 'INR') return null;
    if ([...params.keys()].some((key) => !['pa', 'pn', 'am', 'cu'].includes(key))) return null;
    return { uri: payment.upi_uri, upiId: params.get('pa'), name: params.get('pn') };
  } catch { return null; }
}
