import {
    Field
  } from 'snarkyjs'

const { pinJSONToIPFS } = require("./pinJSONtoIPFS.js")
const { merkleTree} = require("./merkleTree.ts")

require('dotenv').config()

const postMerkle = async (
    root: Field,
    leaves: Field[]
) => {
 
    const treeJSON = merkleTree(
       leaves,
       root
    )

    const treeJsonURI = await pinJSONToIPFS(
        process.env.PINATAAPIKEY,
        process.env.PINATASECRETAPIKEY,
        treeJSON
    )
    return treeJsonURI
}

module.exports = { postMerkle }