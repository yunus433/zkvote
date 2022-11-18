

const merkletree = (
    leaves
) => {
    const jsonString = JSON.stringify(leaves);
    const treeJson = 
    {
        pinataMetadata: {
            name: _name
        },
        pinataContent: {
            description: _description, 
            image: _image_url, 
            name: _name,
            nullifier: _nullifier
        }
        merkleRoot: {"0x71273172371723"},
        treeLeaves: [
            {
                "index": 0,
                "hash": "0x127731273172731"
            }
        ]
    }

    return treeJson
}

module.exports = { merkletree }