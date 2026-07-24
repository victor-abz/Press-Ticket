import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import openSocket from '../services/socket-io';
import toastError from '../errors/toastError';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    const { t } = useTranslation();
    const tRef = useRef(t);
    tRef.current = t;
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const hasDisconnectedBefore = useRef(false);

    useEffect(() => {
        const newSocket = openSocket();

        if (newSocket) {
            newSocket.on('connect', () => {
                setConnected(true);
                if (hasDisconnectedBefore.current) {
                    toast.dismiss("socket-disconnected");
                    toast.success(tRef.current("socketStatus.reconnectedMessage"), {
                        toastId: "socket-reconnected",
                    });
                }
            });

            newSocket.on('disconnect', () => {
                setConnected(false);
                hasDisconnectedBefore.current = true;
                toast.warning(tRef.current("socketStatus.disconnectedMessage"), {
                    toastId: "socket-disconnected",
                    autoClose: false,
                });
            });

            newSocket.on('connect_error', () => {
                setConnected(false);
            });

            newSocket.on('error', (error) => {
                toastError({ message: tRef.current("socketStatus.serverErrorMessage") });
                console.error("[SOCKET] Erro emitido pelo servidor:", error);
            });

            setSocket(newSocket);
        }

        return () => {
            if (newSocket) {
                newSocket.off('connect');
                newSocket.off('disconnect');
                newSocket.off('connect_error');
                newSocket.off('error');
                newSocket.disconnect();
            }
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, connected }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket deve ser usado dentro de um SocketProvider');
    }
    return context;
};
