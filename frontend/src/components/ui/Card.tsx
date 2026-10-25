import type { HTMLAttributes } from 'react';
import s from './Card.module.css';

interface Props extends HTMLAttributes<HTMLElement> {
  tone?: 'default' | 'info' | 'refill';
  as?: 'section' | 'div' | 'article';
}

export function Card({ tone = 'default', as: Tag = 'section', className, ...rest }: Props) {
  return <Tag className={[s.card, s[tone], className].filter(Boolean).join(' ')} {...rest} />;
}

export function Eyebrow({ children, id }: { children: string; id?: string }) {
  return <p id={id} className={s.eyebrow}>{children}</p>;
}
