import {
    Field
  } from 'snarkyjs';

const { pinJSONToIPFS } = require("./pinJSONtoIPFS.js")
const { merkletree} = require("./merkleTree.js")
const axios = require('axios');

require('dotenv').config()

const getMerkle = async (
    ipfsURI: Field
) => {
 
    const url = `https://ipfs.io/ipfs/` + ipfsURI.toString();
    try {
        let res = await axios.get(url);
        let root = Field(await res.data.root);
        let leavesJSON = await res.data.leaves;
        let leaves = JSON.parse(leavesJSON).toFields();
        return {root,leaves};
    } catch (err) {
        console.warn("Error: " + err);
    }
}

module.exports = { getMerkle }