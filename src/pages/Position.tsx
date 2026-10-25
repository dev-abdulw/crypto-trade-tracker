import { useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

export default function Position() {
  const { id } = useParams();
  return (
    <>
      <PageHeader title="Position" />
      <p className="text-muted">Position {id}</p>
    </>
  );
}
