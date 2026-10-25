import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import p from '@/components/ui/Page.module.css';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <p className={p.sub}>That page does not exist. <Link to="/">Go back home</Link></p>
    </>
  );
}
