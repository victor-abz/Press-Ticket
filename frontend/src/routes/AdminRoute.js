import { useContext } from "react";
import { Navigate } from "react-router-dom";
import BackdropLoading from "../components/BackdropLoading";
import { AuthContext } from "../context/Auth/AuthContext";

const AdminRoute = ({ element }) => {
  const { isAuth, loading, user } = useContext(AuthContext);

  if (loading) {
    return <BackdropLoading />;
  }

  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }

  if (user?.profile !== "admin" && user?.profile !== "masteradmin") {
    return <Navigate to="/" replace />;
  }

  return element;
};

export default AdminRoute;
