#!/bin/bash

while read -r dir; do
	rm -rf $dir;
done <<< $(jq --raw-output '.[]' remove.json);
