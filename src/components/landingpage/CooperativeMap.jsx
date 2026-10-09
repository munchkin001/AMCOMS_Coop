const POSITION = '8.8595116,125.0518517';
const NAME = 'Agay-ayan Multi-Purpose Cooperative Inc.';

const CooperativeMap = () => (
  <iframe
    src={`https://maps.google.com/maps?q=${POSITION}&z=17&output=embed`}
    title={`Map showing ${NAME}`}
    style={{ height: '100%', width: '100%', minHeight: 384, border: 0 }}
    loading="lazy"
    referrerPolicy="no-referrer-when-downgrade"
    allowFullScreen
    aria-label={`Google Map showing ${NAME}`}
  />
);

export default CooperativeMap;
