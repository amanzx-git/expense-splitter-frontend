import { Children, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Select-only ARIA combobox. Values and change handlers match our controlled selects.
export default function Select({ id, value, onChange, children, disabled = false, ...rest }) {
  const generated = useId(), listId = `${generated}-list`;
  const options = Children.toArray(children).filter(Boolean).map((child) => ({ value: String(child.props.value ?? ''), label: child.props.children, disabled: child.props.disabled }));
  const selected = options.findIndex((option) => option.value === String(value));
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [placement, setPlacement] = useState({});
  const trigger = useRef(null), menu = useRef(null), search = useRef({ text: '', at: 0 });
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
  const isOpen = open && !disabled;
  function show(index = selected) { setActive(enabled.includes(index) ? index : enabled[0] ?? -1); setOpen(true); }
  function choose(index) {
    if (disabled || !options[index] || options[index].disabled) return;
    onChange?.({ target: { value: options[index].value }, currentTarget: { value: options[index].value } });
    setOpen(false); trigger.current?.focus();
  }
  useLayoutEffect(() => {
    if (!isOpen) return;
    const position = () => {
      const rect = trigger.current.getBoundingClientRect(), gap = 5, edge = 8;
      const below = window.innerHeight - rect.bottom - edge, above = rect.top - edge;
      const useAbove = below < 180 && above > below;
      const height = Math.max(44, Math.min(280, (useAbove ? above : below) - gap));
      const width = Math.min(Math.max(rect.width, 160), window.innerWidth - edge * 2);
      setPlacement({ position: 'fixed', width, maxHeight: height, left: Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge)), top: useAbove ? undefined : rect.bottom + gap, bottom: useAbove ? window.innerHeight - rect.top + gap : undefined });
    };
    position(); menu.current?.showPopover?.();
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); menu.current?.hidePopover?.(); };
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const dismiss = (event) => { if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss); };
  }, [isOpen]);
  useEffect(() => { if (isOpen) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, isOpen, listId]);
  function keydown(event) {
    if (event.key === 'Escape' && isOpen) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!isOpen) { show(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : selected); return; }
      const current = enabled.indexOf(active);
      setActive(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : enabled[(current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length] ?? -1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (isOpen) choose(active); else show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); const now = Date.now();
      search.current.text = now - search.current.at < 700 ? search.current.text + event.key.toLowerCase() : event.key.toLowerCase(); search.current.at = now;
      const match = enabled.find((index) => String(options[index].label).toLowerCase().startsWith(search.current.text));
      if (match !== undefined) { setActive(match); setOpen(true); }
    }
  }
  return <>
    <button {...rest} id={id || generated} type="button" ref={trigger} className="themed-select" role="combobox" aria-haspopup="listbox" aria-expanded={isOpen} aria-controls={isOpen ? listId : undefined} aria-activedescendant={isOpen && active >= 0 ? `${listId}-${active}` : undefined} disabled={disabled} value={value} onClick={() => isOpen ? setOpen(false) : show()} onKeyDown={keydown}>
      <span>{options[selected]?.label ?? 'Choose…'}</span><span aria-hidden="true">⌄</span>
    </button>
    {isOpen && createPortal(<div ref={menu} id={listId} role="listbox" aria-labelledby={id || generated} className="themed-select-menu" popover={typeof HTMLElement.prototype.showPopover === 'function' ? 'manual' : undefined} style={placement}>
      {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option" aria-selected={index === selected} aria-disabled={option.disabled || undefined} data-value={option.value} data-highlighted={index === active || undefined} className="themed-select-option" onPointerMove={() => { if (!option.disabled) setActive(index); }} onPointerDown={(event) => { if (event.pointerType === 'mouse') event.preventDefault(); }} onClick={() => choose(index)}><span>{option.label}</span><span className="select-check" aria-hidden="true">{index === selected ? '✓' : ''}</span></div>)}
    </div>, trigger.current?.closest('dialog') || document.body)}
  </>;
}
