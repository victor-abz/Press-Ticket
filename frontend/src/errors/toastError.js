import { toast } from "react-toastify";
import WhatsMarked from "react-whatsmarked";

const STATUS_ERROR_KEY = {
	401: "errors.unauthorized",
	403: "errors.forbidden",
	404: "errors.notFound",
	409: "errors.conflict",
};

const toastError = (err, t) => {
	const errorMsg =
		err?.response?.data?.message || err?.response?.data?.error;

	if (errorMsg) {
		const translatedMsgKey = `backendErrors.${errorMsg}`;
		const translatedMsg = t && t(translatedMsgKey) !== translatedMsgKey
			? t(translatedMsgKey)
			: errorMsg;

		toast.error(<WhatsMarked>{translatedMsg}</WhatsMarked>, {
			toastId: errorMsg,
		});
		return;
	}

	if (!err?.response) {
		if (err?.isAxiosError) {
			const networkMsg = t
				? t("errors.networkError")
				: "No connection to the server. Check your internet and try again.";

			toast.error(<WhatsMarked>{networkMsg}</WhatsMarked>, {
				toastId: "networkError",
			});
			return;
		}

		if (err?.message) {
			toast.error(<WhatsMarked>{err.message}</WhatsMarked>, {
				toastId: err.message,
			});
			return;
		}
	} else {
		const status = err.response.status;
		const statusKey = STATUS_ERROR_KEY[status] || (status >= 500 ? "errors.serverError" : null);

		if (statusKey && t) {
			toast.error(<WhatsMarked>{t(statusKey)}</WhatsMarked>, {
				toastId: statusKey,
			});
			return;
		}
	}

	const fallbackMsg = t && t("backendErrors.genericError") !== "backendErrors.genericError"
		? t("backendErrors.genericError")
		: "An unexpected error occurred!";

	toast.error(<WhatsMarked>{fallbackMsg}</WhatsMarked>, {
		toastId: "genericError",
	});
};

export default toastError;
