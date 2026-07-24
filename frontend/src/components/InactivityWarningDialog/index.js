import React, { useState, useEffect } from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Typography,
    Box,
    LinearProgress
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { useTranslation } from "react-i18next";

const InactivityWarningDialog = ({
    open,
    warningMinutes = 2,
    onContinue,
    onLogout
}) => {
    const { t } = useTranslation();
    const totalSeconds = warningMinutes * 60;
    const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

    useEffect(() => {
        if (!open) {
            setSecondsLeft(totalSeconds);
            return;
        }

        const interval = setInterval(() => {
            setSecondsLeft(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        return () => clearInterval(interval);
    }, [open, totalSeconds]);

    useEffect(() => {
        if (open && secondsLeft === 0 && onLogout) {
            onLogout();
        }
    }, [open, secondsLeft, onLogout]);

    const formatTime = seconds => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const progress = ((totalSeconds - secondsLeft) / totalSeconds) * 100;

    return (
        <Dialog
            open={open}
            maxWidth="xs"
            fullWidth
            disableEscapeKeyDown
        >
            <DialogTitle>
                <Box display="flex" alignItems="center" gap={1}>
                    <AccessTimeIcon color="warning" />
                    <Typography variant="h6" component="span">
                        {t("inactivity.warningTitle")}
                    </Typography>
                </Box>
            </DialogTitle>
            <DialogContent>
                <Typography variant="body1" color="text.secondary">
                    {t("inactivity.warningMessage", { time: formatTime(secondsLeft) })}
                </Typography>
                <LinearProgress
                    variant="determinate"
                    value={progress}
                    color="warning"
                    sx={{ mt: 2, borderRadius: 1 }}
                />
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button
                    color="error"
                    onClick={onLogout}
                >
                    {t("inactivity.logoutNow")}
                </Button>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={onContinue}
                    autoFocus
                >
                    {t("inactivity.continueSession")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default InactivityWarningDialog;
