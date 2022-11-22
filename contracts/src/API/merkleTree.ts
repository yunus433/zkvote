import {
    Field
  } from 'snarkyjs';

const merkleTreeJSON = (
    leaves: Field[],
    root: Field
) => {
    const leavesJSON = JSON.stringify(leaves);
    
    const treeJson = 
    {
        merkleRoot: root,
        treeLeaves: leaves
    }

    return treeJson
}

module.exports = { merkleTreeJSON }