import { decryptValue } from "../../helpers/EncryptionHelper";
import Setting from "../../models/Setting";

const ListSettingsService = async (): Promise<object[]> => {
  const settings = await Setting.findAll();

  return settings.map(s => {
    const json = s.toJSON() as { key: string; value: string };
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
