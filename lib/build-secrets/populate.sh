#!/bin/bash
set -e

while read -r name content; do
	mkdir -p $(dirname "$name")
	echo  "$content" | base64 -d > "$name";
done <<< $(jq --raw-output '. as $top | keys[] as $k | .[$k].files | keys[] as $f | "\($top[$k].tmpDirectory + "/" + $f) \(.[$f])"' secrets.json)

