# Jupiter Discovery Service Filters

## 🔍 **Updated Filter List (Latest)**

### **Discovery Import Endpoint Filters** (`/api/internal/discovery/import`)

The Jupiter Discovery service applies the following filters when importing tokens:

#### **1. Contract Address Validation**
```javascript
if (!contract || contract.length < 10) { 
  skipped++; 
  continue; 
}
```
- **Purpose**: Ensure valid Solana contract addresses
- **Criteria**: Must be at least 10 characters long

#### **2. Stable Token Exclusion**
```javascript
const stableSymbols = new Set(['SOL', 'JUP', 'WETH', 'WSOL', 'WBTC', 'USDC']);
if (stableSymbols.has(symbol)) { 
  skipped++; 
  continue; 
}
```
- **Purpose**: Remove non-meme tokens and stablecoins
- **Criteria**: Symbol not in stable token list

#### **3. Graduation Requirement**
```javascript
if (!c.graduatedAt) { 
  skipped++; 
  continue; 
}
```
- **Purpose**: Jupiter-specific quality gate
- **Criteria**: Must have `graduatedAt` timestamp

#### **4. 🆕 Suspicious Token Filter (NEW)**
```javascript
if (c.audit && c.audit.isSus === true) { 
  console.log(`[🔍 Discovery Import] 🚫 Skipping suspicious token: ${symbol} (isSus=true)`);
  skipped++; 
  continue; 
}
```
- **Purpose**: Exclude tokens flagged as suspicious by audit systems
- **Criteria**: `audit.isSus` must not be `true`
- **Behavior**: 
  - ✅ Tokens without audit field: **ALLOWED**
  - ✅ Tokens with `audit.isSus = false`: **ALLOWED**
  - ✅ Tokens with audit but no `isSus` field: **ALLOWED**
  - 🚫 Tokens with `audit.isSus = true`: **BLOCKED**

## 📊 **Complete Filter Summary**

| **Filter** | **Criteria** | **Action** | **Status** |
|------------|--------------|------------|------------|
| Contract Validation | Length > 10 chars | Skip if invalid | Active |
| Stable Token | Not in stable list | Skip if stable | Active |
| Graduation | Has `graduatedAt` | Skip if not graduated | Active |
| **Suspicious Audit** | **`audit.isSus !== true`** | **Skip if suspicious** | **🆕 NEW** |

## 🧪 **Testing the isSus Filter**

Run the test script to verify the filter works:

```bash
cd backend
node test-issus-filter.js
```

**Test Scenarios:**
- ✅ `audit.isSus = false` → Token imported
- 🚫 `audit.isSus = true` → Token skipped
- ✅ No audit field → Token imported
- ✅ Audit field without `isSus` → Token imported

## 📝 **Audit Data Storage**

The audit information is now stored in the Jupiter data for reference:

```javascript
const jupInfo = {
  // ... other fields
  audit: c.audit || null, // Store complete audit information
  // ... other fields
};
```

This allows you to:
- Track audit scores and flags
- Reference suspicious token decisions
- Monitor audit data changes over time

## 🔍 **Example Audit Data**

```json
{
  "audit": {
    "isSus": false,
    "score": 85,
    "flags": [],
    "lastChecked": "2024-01-15T10:30:00Z"
  }
}
```

## 🚨 **Impact**

This filter will:
- ✅ **Improve token quality** by excluding suspicious tokens
- ✅ **Reduce risk** of importing potentially harmful tokens
- ✅ **Maintain audit trail** by storing audit data
- ✅ **Provide transparency** with console logging of skipped tokens

The filter is **non-breaking** - tokens without audit data continue to be imported normally.
