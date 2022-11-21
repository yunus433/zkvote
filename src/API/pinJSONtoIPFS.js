const axios = require('axios');

const pinJSONToIPFS = (pinataApiKey, pinataSecretApiKey, JSONBody) => {
    const url = `https://api.pinata.cloud/pinning/pinJSONToIPFS`;
    return axios
        .post(url, JSONBody, {
            headers: {
                pinata_api_key: pinataApiKey,
                pinata_secret_api_key: pinataSecretApiKey
            }
        })
        .then((response) => {
            const ipfsURI = response.data.IpfsHash.toString()
            return ipfsURI
        })
        .catch((error) => {
            console.error(error)
        })
}

module.exports = { pinJSONToIPFS }

// To TS
