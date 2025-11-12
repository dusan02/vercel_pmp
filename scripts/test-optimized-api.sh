#!/bin/bash
# Test script for optimized API endpoint
# Tests: ETag/304, payload size, keyset stability

URL="http://localhost:3000/api/stocks/optimized?sort=mcap&dir=desc&limit=50"

echo "=== Testing Optimized API ==="
echo ""

# 1. First request - get ETag
echo "1. First request (getting ETag)..."
RESPONSE1=$(curl -s -i "$URL" -H "Accept: application/json")
ETAG=$(echo "$RESPONSE1" | grep -i "ETag:" | sed 's/.*ETag: //i' | tr -d '\r' | tr -d '\n')
STATUS1=$(echo "$RESPONSE1" | head -n 1 | awk '{print $2}')

echo "   Status: $STATUS1"
echo "   ETag: $ETAG"
echo ""

# 2. Conditional GET with ETag (should return 304)
if [ -n "$ETAG" ]; then
  echo "2. Conditional GET with ETag (expecting 304)..."
  RESPONSE2=$(curl -s -i "$URL" -H "If-None-Match: $ETAG")
  STATUS2=$(echo "$RESPONSE2" | head -n 1 | awk '{print $2}')
  echo "   Status: $STATUS2 (expected: 304)"
  if [ "$STATUS2" = "304" ]; then
    echo "   ✅ 304 Not Modified - ETag working correctly"
  else
    echo "   ❌ Expected 304, got $STATUS2"
  fi
  echo ""
fi

# 3. Payload size check
echo "3. Payload size check..."
PAYLOAD=$(curl -s "$URL")
BYTES=$(echo -n "$PAYLOAD" | wc -c)
echo "   Payload size: $BYTES bytes"
if [ "$BYTES" -lt 30000 ]; then
  echo "   ✅ Payload < 30 KB (target: < 30 KB)"
else
  echo "   ⚠️ Payload >= 30 KB (consider optimization)"
fi
echo ""

# 4. Keyset pagination stability
echo "4. Keyset pagination stability test..."
PAGE1=$(curl -s "$URL")
CURSOR1=$(echo "$PAGE1" | grep -o '"nextCursor":"[^"]*"' | cut -d'"' -f4)
FIRST1=$(echo "$PAGE1" | grep -o '"t":"[^"]*"' | head -n 1 | cut -d'"' -f4)
LAST1=$(echo "$PAGE1" | grep -o '"t":"[^"]*"' | tail -n 1 | cut -d'"' -f4)

if [ -n "$CURSOR1" ]; then
  PAGE2=$(curl -s "$URL&cursor=$CURSOR1")
  FIRST2=$(echo "$PAGE2" | grep -o '"t":"[^"]*"' | head -n 1 | cut -d'"' -f4)
  
  echo "   Page 1 - First: $FIRST1, Last: $LAST1"
  echo "   Page 2 - First: $FIRST2"
  
  if [ "$FIRST2" != "$LAST1" ]; then
    echo "   ✅ No duplicate at boundary (keyset stable)"
  else
    echo "   ❌ Duplicate detected at boundary"
  fi
else
  echo "   ⚠️ No cursor returned (single page or error)"
fi
echo ""

# 5. Response headers check
echo "5. Response headers check..."
HEADERS=$(curl -s -I "$URL")
CACHE_CONTROL=$(echo "$HEADERS" | grep -i "Cache-Control:" | sed 's/.*Cache-Control: //i' | tr -d '\r')
X_DURATION=$(echo "$HEADERS" | grep -i "X-Query-Duration-ms:" | sed 's/.*X-Query-Duration-ms: //i' | tr -d '\r')

echo "   Cache-Control: $CACHE_CONTROL"
echo "   X-Query-Duration-ms: $X_DURATION"
if [ -n "$CACHE_CONTROL" ]; then
  echo "   ✅ Cache headers present"
else
  echo "   ⚠️ Cache headers missing"
fi
echo ""

echo "=== Test Complete ==="

