import { decryptValue } from "../../helpers/EncryptionHelper";
import Setting from "../../models/Setting";

interface SafeSetting {
  key: string;
  value: string;
}

const ListSettingsService = async (): Promise<SafeSetting[]> => {
  const settings = await Setting.findAll();

  return settings.map(s => {
    const json = s.toJSON() as SafeSetting;
    if (json.value?.startsWith("enc:v1:")) {
      try {
        json.value = decryptValue(json.value);
      } catch {
        json.value = "";
      }
    }
    return json;
  });
};

export default ListSettingsService;
