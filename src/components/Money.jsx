// Display only. `value` is a decimal STRING such as "120.50" (R1.2-15).
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export default function Money({ value, className = '' }) {
  return <span className={`money${className ? ' '+className : ''}`}>{inr.format(value)}</span>;
}
