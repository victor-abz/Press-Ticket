import { decryptValue } from "../../helpers/EncryptionHelper";
import Integration from "../../models/Integration";

const ListIntegrationsService = async (): Promise<object[]> => {
  const integrations = await Integration.findAll();

  return integrations.map(i => {
    const json = i.toJSON() as { key: string; value: string };
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

export default ListIntegrationsService;
