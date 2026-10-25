import { useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

export default function Month() {
  const { month } = useParams();
  return (
    <>
      <PageHeader title={`Month ${month ?? ''}`} />
      <p className="text-muted">Month report coming soon.</p>
    </>
  );
}
