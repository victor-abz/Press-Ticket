import {
	Box,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	IconButton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Tooltip,
	Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const StyledDialog = styled(Dialog)(({ theme }) => ({
	'& .MuiDialogTitle-root': {
		backgroundColor: theme.palette.primary.main,
		color: '#fff',
		fontWeight: 500,
		padding: theme.spacing(2),
	},
	'& .MuiDialogContent-root': {
		padding: theme.spacing(3),
	},
	'& .MuiDialogActions-root': {
		padding: theme.spacing(2),
	},
}));

const LockedUsersModal = ({ open, onClose }) => {
	const { t } = useTranslation();
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(false);
	const [unlockingId, setUnlockingId] = useState(null);

	const fetchLockedUsers = useCallback(async () => {
		setLoading(true);
		try {
			const { data } = await api.get("/users/locked");
			setUsers(data);
		} catch (err) {
			toastError(err, t);
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		if (open) {
			fetchLockedUsers();
		} else {
			setUsers([]);
		}
	}, [open, fetchLockedUsers]);

	const handleUnlock = async (userId) => {
		setUnlockingId(userId);
		try {
			const { data } = await api.post(`/users/${userId}/unlock`);
			toast.success(data?.message || t("lockedUsers.unlockSuccess"));
			setUsers((prevUsers) => prevUsers.filter((u) => u.id !== userId));
		} catch (err) {
			toastError(err, t);
		} finally {
			setUnlockingId(null);
		}
	};

	return (
		<StyledDialog
			open={open}
			onClose={onClose}
			maxWidth="md"
			fullWidth
			PaperProps={{ sx: { borderRadius: 2 } }}
		>
			<DialogTitle>{t("lockedUsers.title")}</DialogTitle>
			<DialogContent>
				{loading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
						<CircularProgress size={28} />
					</Box>
				) : users.length === 0 ? (
					<Typography color="text.secondary" align="center" sx={{ py: 4 }}>
						{t("lockedUsers.empty")}
					</Typography>
				) : (
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell>{t("lockedUsers.columns.name")}</TableCell>
								<TableCell>{t("lockedUsers.columns.email")}</TableCell>
								<TableCell>{t("lockedUsers.columns.lockedUntil")}</TableCell>
								<TableCell align="center">{t("lockedUsers.columns.lockCount")}</TableCell>
								<TableCell align="center">{t("lockedUsers.columns.actions")}</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{users.map((lockedUser) => (
								<TableRow key={lockedUser.id}>
									<TableCell>{lockedUser.name}</TableCell>
									<TableCell>{lockedUser.email}</TableCell>
									<TableCell>
										{lockedUser.lockedUntil
											? format(parseISO(lockedUser.lockedUntil), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
											: "-"}
									</TableCell>
									<TableCell align="center">{lockedUser.lockCount}</TableCell>
									<TableCell align="center">
										<Tooltip title={t("lockedUsers.unlock")} arrow placement="top">
											<span>
												<IconButton
													size="small"
													color="primary"
													disabled={unlockingId === lockedUser.id}
													onClick={() => handleUnlock(lockedUser.id)}
												>
													{unlockingId === lockedUser.id ? (
														<CircularProgress size={18} />
													) : (
														<LockOpenIcon fontSize="small" />
													)}
												</IconButton>
											</span>
										</Tooltip>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</DialogContent>
			<Divider />
			<DialogActions>
				<Button onClick={onClose} variant="contained" color="primary" sx={{ borderRadius: 20 }}>
					{t("users.buttons.close")}
				</Button>
			</DialogActions>
		</StyledDialog>
	);
};

export default LockedUsersModal;
