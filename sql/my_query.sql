select  *
from    "Users" as u
        left join "Record" as r
        on r.user_id = u.code
        AND r.ymd = ymd_param
