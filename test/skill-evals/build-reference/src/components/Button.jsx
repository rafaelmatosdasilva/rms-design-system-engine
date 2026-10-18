import './button.css';
export function Button({ Label = 'Save', Disabled = false, ...rest }) {
  return <button type="button" className="button" disabled={Disabled} {...rest}>{Label}</button>;
}
