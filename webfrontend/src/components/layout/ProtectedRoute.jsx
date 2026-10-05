import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../common/Spinner';

export function ProtectedRoute({ children }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (status === 'guest') {
    return <Navigate to="/staff/login" replace />;
  }

  return children;
}
