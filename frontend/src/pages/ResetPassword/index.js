import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import { styled } from '@mui/material/styles';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { getImageUrl } from '../../helpers/imageHelper';
import toastError from "../../errors/toastError";
import api from "../../services/api";

const PASSWORD_SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

/**
 * Calcula a força da senha com base nas mesmas regras do backend.
 * Retorna: 0 = inválida, 1 = fraca, 2 = média, 3 = forte
 */
const getPasswordStrength = (password) => {
    if (!password) return 0;

    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (PASSWORD_SPECIAL_CHARS_REGEX.test(password)) score++;

    if (score <= 2) return 1; // fraca
    if (score <= 4) return 2; // média
    return 3;                  // forte (todos os 5 critérios)
};

const Copyright = ({ companyName, companyUrl }) => {
    return (
        <Typography variant="body2" color="textSecondary" align="center">
            {new Date().getFullYear()}
            {" - "}
            <Link color="inherit" href={companyUrl || "https://github.com/rtenorioh/Press-Ticket"}>
                {companyName || "Press Ticket®"}
            </Link>
            {"."}
        </Typography>
    );
};

const LoginCard = styled(Card)(({ theme }) => ({
    borderRadius: 12,
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)',
    overflow: 'visible',
    position: 'relative',
    width: '100%',
    maxWidth: 450,
    padding: theme.spacing(2, 3),
    [theme.breakpoints.up('sm')]: {
        padding: theme.spacing(3, 4),
    },
}));

const LogoContainer = styled('div')(({ theme }) => ({
    display: 'flex',
    justifyContent: 'center',
    marginBottom: theme.spacing(4),
    '& img': {
        height: 80,
        [theme.breakpoints.up('sm')]: {
            height: 100,
        },
    },
}));

const StyledForm = styled('form')(({ theme }) => ({
    width: "100%",
    marginTop: theme.spacing(2),
}));

const StyledDiv = styled('div')(({ theme }) => ({
    minHeight: '100vh',
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(3),
    backgroundColor: theme.palette.background.default,
}));

const StyledButton = styled(Button)(({ theme }) => ({
    margin: theme.spacing(3, 0, 2),
    borderRadius: 50,
    padding: theme.spacing(1.2),
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '1rem',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.3s ease',
    '&:hover': {
        boxShadow: '0 6px 15px rgba(0, 0, 0, 0.15)',
        transform: 'translateY(-2px)'
    },
}));

const StyledTextField = styled(TextField)(({ theme }) => ({
    marginBottom: theme.spacing(2),
    '& .MuiOutlinedInput-root': {
        borderRadius: 8,
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 2,
        },
    },
}));

const LinksContainer = styled(Grid)(({ theme }) => ({
    marginTop: theme.spacing(2),
}));

const CopyrightContainer = styled(Box)(({ theme }) => ({
    marginTop: theme.spacing(4),
    textAlign: 'center',
}));

const ResetPassword = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const token = new URLSearchParams(location.search).get("token");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [theme, setTheme] = useState("light");
    const [companyData, setCompanyData] = useState({
        logo: 'logo.jpg',
        name: "Press Ticket®",
        url: "https://github.com/rtenorioh/Press-Ticket"
    });

    useEffect(() => {
        const fetchCompanyData = async () => {
            try {
                const { data } = await api.get("/personalizations");

                if (data && data.length > 0) {

                    const lightConfig = data.find(themeConfig => themeConfig.theme === "light");

                    if (lightConfig) {
                        setCompanyData(prevData => ({
                            ...prevData,
                            name: lightConfig.company || "Press Ticket®",
                            url: lightConfig.url || "https://github.com/rtenorioh/Press-Ticket"
                        }));
                    }
                }
            } catch (err) {
                toastError(err);
            }
        };

        const savedTheme = localStorage.getItem("theme") || "light";
        setTheme(savedTheme);

        fetchCompanyData();
    }, []);

    useEffect(() => {
        const fetchLogo = async () => {
            try {
                const { data } = await api.get("/personalizations");

                if (data && data.length > 0) {
                    const lightConfig = data.find(themeConfig => themeConfig.theme === "light");
                    const darkConfig = data.find(themeConfig => themeConfig.theme === "dark");

                    if (theme === "light" && lightConfig && lightConfig.logo) {
                        setCompanyData(prevData => ({
                            ...prevData,
                            logo: lightConfig.logo
                        }));
                    } else if (theme === "dark" && darkConfig && darkConfig.logo) {
                        setCompanyData(prevData => ({
                            ...prevData,
                            logo: darkConfig.logo
                        }));
                    } else {
                        setCompanyData(prevData => ({
                            ...prevData,
                            logo: 'logo.jpg'
                        }));
                    }
                }

            } catch (err) {
                toastError(err);
            }
        };

        fetchLogo();
    }, [theme]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error(t("resetPassword.error.passwordMismatch"));
            return;
        }

        if (getPasswordStrength(password) < 3) {
            toast.error(t("passwordStrength.requirements"));
            return;
        }

        try {
            await api.post("/auth/reset-password", {
                token,
                newPassword: password,
            });
            toast.success(t("resetPassword.success"));
        } catch (err) {
            toastError(err, t);
        }
    };

    return (
        <>
            <CssBaseline />
            <StyledDiv>
                <LoginCard elevation={0}>
                    <CardContent sx={{ padding: 0 }}>
                        <LogoContainer>
                            <img src={getImageUrl(companyData.logo)} alt="logo" />
                        </LogoContainer>
                        
                        <Typography component="h1" variant="h5" align="center" fontWeight="600" gutterBottom>
                            {t("resetPassword.title")}
                        </Typography>
                        
                        <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 3 }}>
                            {t("resetPassword.subtitle", "Defina sua nova senha para acessar o sistema")}
                        </Typography>
                        
                        <StyledForm noValidate onSubmit={handleSubmit}>
                            <StyledTextField
                                variant="outlined"
                                required
                                fullWidth
                                name="password"
                                label={t("resetPassword.form.password")}
                                type="password"
                                id="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <LockOutlinedIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />

                            {password && (
                                <Box sx={{ mt: -1, mb: 1 }}>
                                    <LinearProgress
                                        variant="determinate"
                                        value={(getPasswordStrength(password) / 3) * 100}
                                        sx={{
                                            height: 4,
                                            borderRadius: 2,
                                            "& .MuiLinearProgress-bar": {
                                                backgroundColor:
                                                    getPasswordStrength(password) === 1 ? "error.main" :
                                                    getPasswordStrength(password) === 2 ? "warning.main" :
                                                    "success.main",
                                            },
                                        }}
                                    />
                                    <Typography variant="caption" color={
                                        getPasswordStrength(password) === 1 ? "error" :
                                        getPasswordStrength(password) === 2 ? "warning.main" :
                                        "success.main"
                                    }>
                                        {getPasswordStrength(password) === 1 && t("passwordStrength.weak")}
                                        {getPasswordStrength(password) === 2 && t("passwordStrength.medium")}
                                        {getPasswordStrength(password) === 3 && t("passwordStrength.strong")}
                                    </Typography>
                                </Box>
                            )}

                            <StyledTextField
                                variant="outlined"
                                required
                                fullWidth
                                name="confirmPassword"
                                label={t("resetPassword.form.confirmPassword")}
                                type="password"
                                id="confirmPassword"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <LockOutlinedIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            
                            <StyledButton
                                type="submit"
                                fullWidth
                                variant="contained"
                                color="primary"
                                disableElevation
                            >
                                {t("resetPassword.buttons.submit")}
                            </StyledButton>
                            
                            <Divider sx={{ my: 2 }}>
                                <Typography variant="caption" color="textSecondary">
                                    {t("resetPassword.or", "ou")}
                                </Typography>
                            </Divider>
                            
                            <LinksContainer container justifyContent="center">
                                <Grid item>
                                    <Link
                                        component={RouterLink}
                                        to="/login"
                                        variant="body2"
                                        color="primary"
                                        underline="hover"
                                    >
                                        {t("resetPassword.buttons.backToLogin")}
                                    </Link>
                                </Grid>
                            </LinksContainer>
                        </StyledForm>
                    </CardContent>
                </LoginCard>
                
                <CopyrightContainer>
                    <Copyright companyName={companyData.name} companyUrl={companyData.url} />
                </CopyrightContainer>
            </StyledDiv>
        </>
    );
};

export default ResetPassword;
